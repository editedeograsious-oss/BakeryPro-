import PosTerminal from "@/components/core/PosTerminal";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPosPageData } from "@/lib/repositories/coreLive";

export const dynamic="force-dynamic";
export const revalidate=0;

export default async function POS(){
  const staff=await requireStaff(["owner","manager","cashier"]);
  const data=await getPosPageData();

  let products=(data.products??[]).map((p:any)=>({...p,available_stock:0}));
  let recentSales:any[]=[];

  if(!data.demo){
    const supabase=await createClient();

    const [
      {data:sales,error:salesError},
      {data:stockRows,error:stockError},
    ]=await Promise.all([
      supabase
        .from("sales_management_summary")
        .select("id,sale_no,status,subtotal,discount,total,refund_total,net_total,cashier_name,customer_name,payment_summary,created_at")
        .order("created_at",{ascending:false})
        .limit(25),
      supabase
        .from("finished_goods_batch_summary")
        .select("product_id,quantity_available"),
    ]);

    if(salesError)throw salesError;
    if(stockError)throw stockError;

    const ids=(sales??[]).map((s:any)=>s.id);
    let saleItems:any[]=[];
    if(ids.length){
      const {data:items,error:itemError}=await supabase
        .from("sale_items")
        .select("sale_id,product_id,quantity,line_total,unit_cost_snapshot,gross_profit_snapshot")
        .in("sale_id",ids);
      if(itemError)throw itemError;
      saleItems=items??[];
    }

    const productName=new Map((data.products??[]).map((p:any)=>[p.id,p.name]));
    const itemsBySale=new Map<string,any[]>();
    for(const item of saleItems){
      if(!itemsBySale.has(item.sale_id))itemsBySale.set(item.sale_id,[]);
      itemsBySale.get(item.sale_id)!.push(item);
    }

    recentSales=(sales??[]).map((sale:any)=>{
      const items=itemsBySale.get(sale.id)??[];
      const units=items.reduce((s:number,i:any)=>s+Number(i.quantity||0),0);
      const cogs=items.reduce((s:number,i:any)=>s+(Number(i.quantity||0)*Number(i.unit_cost_snapshot||0)),0);
      const grossProfit=items.reduce((s:number,i:any)=>s+Number(i.gross_profit_snapshot||0),0);
      const itemsSummary=items.map((i:any)=>`${Number(i.quantity||0)} × ${productName.get(i.product_id)??"Product"}`).join(", ");
      return {...sale,units_sold:units,cogs,gross_profit:grossProfit,items_summary:itemsSummary};
    });

    const stockMap=new Map<string,number>();
    for(const row of stockRows??[]){
      stockMap.set(row.product_id,(stockMap.get(row.product_id)??0)+Number(row.quantity_available||0));
    }
    products=(data.products??[]).map((p:any)=>({...p,available_stock:stockMap.get(p.id)??0}));
  }

  return <PosTerminal
    products={products}
    openShift={data.openShift}
    customers={data.customers}
    recentSales={recentSales}
    live={!data.demo}
    showProfit={staff.profile.role==="owner"||staff.profile.role==="manager"}
  />;
}
