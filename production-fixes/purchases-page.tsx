import Sidebar from "@/components/Sidebar";
import PurchaseReceivingPanel from "@/components/operations/PurchaseReceivingPanel";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPurchaseReceivingData } from "@/lib/repositories/operationsLive";

export const dynamic="force-dynamic";

export default async function Purchases(){
  await requireStaff(["owner","manager","storekeeper"]);
  const data=await getPurchaseReceivingData();

  let history:any[]=[];
  let operationsAllowed=true;
  let operationsReason="Business operations are enabled";

  if(!data.demo){
    const supabase=await createClient();
    const [{data:status},{data:orders,error:oErr},{data:items,error:iErr},{data:materials,error:mErr}]=await Promise.all([
      supabase.rpc("business_operation_status"),
      supabase.from("purchase_order_summary").select("*").order("created_at",{ascending:false}).limit(60),
      supabase.from("purchase_items").select("id,purchase_id,raw_material_id,ordered_qty_base,received_qty_base,unit_cost_base,line_total").order("created_at",{ascending:false}).limit(300),
      supabase.from("raw_materials").select("id,name,base_unit"),
    ]);

    if(oErr)throw oErr;
    if(iErr)throw iErr;
    if(mErr)throw mErr;

    operationsAllowed=status?.allowed===true;
    operationsReason=String(status?.reason??"Business operations are currently unavailable");

    const orderMap=new Map((orders??[]).map((o:any)=>[o.id,o]));
    const materialMap=new Map((materials??[]).map((m:any)=>[m.id,m]));

    history=(items??[])
      .filter((item:any)=>orderMap.has(item.purchase_id))
      .map((item:any)=>{
        const order:any=orderMap.get(item.purchase_id);
        const material:any=materialMap.get(item.raw_material_id);
        return {
          ...item,
          purchase_no:order?.purchase_no,
          purchase_date:order?.purchase_date,
          supplier_name:order?.supplier_name,
          total_amount:order?.total_amount,
          amount_paid:order?.amount_paid,
          outstanding_amount:order?.outstanding_amount,
          payment_status:order?.payment_status,
          status:order?.status,
          material_name:material?.name??"Material",
          base_unit:material?.base_unit??"",
          remaining_qty_base:Number(item.ordered_qty_base||0)-Number(item.received_qty_base||0),
        };
      })
      .slice(0,120);
  }

  return <div className="shell"><Sidebar/><main className="main">
    <PurchaseReceivingPanel
      lines={data.lines}
      history={history}
      live={!data.demo}
      operationsAllowed={operationsAllowed}
      operationsReason={operationsReason}
    />
  </main></div>;
}
