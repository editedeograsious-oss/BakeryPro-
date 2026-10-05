import Sidebar from "@/components/Sidebar";
import PurchaseReceivingPanel from "@/components/operations/PurchaseReceivingPanel";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPurchaseReceivingData } from "@/lib/repositories/operationsLive";

export const dynamic="force-dynamic";
export const revalidate=0;

export default async function Purchases(){
  await requireStaff(["owner","manager","storekeeper"]);
  const data=await getPurchaseReceivingData();

  let history:any[]=[];
  if(!data.demo){
    const supabase=await createClient();
    const {data:items,error}=await supabase
      .from("purchase_items")
      .select("id,purchase_id,ordered_qty_base,received_qty_base,unit_cost_base,line_total,raw_materials(name,base_unit),purchases(purchase_no,purchase_date,status,suppliers(name))")
      .gt("received_qty_base",0)
      .order("created_at",{ascending:false})
      .limit(200);
    if(error)throw error;

    history=(items??[]).map((row:any)=>({
      id:row.id,
      purchase_id:row.purchase_id,
      purchase_no:row.purchases?.purchase_no??"—",
      purchase_date:row.purchases?.purchase_date??null,
      supplier_name:row.purchases?.suppliers?.name??"—",
      material_name:row.raw_materials?.name??"—",
      base_unit:row.raw_materials?.base_unit??"",
      ordered_qty_base:row.ordered_qty_base,
      received_qty_base:row.received_qty_base,
      unit_cost_base:row.unit_cost_base,
      line_total:row.line_total,
      status:row.purchases?.status??null,
    }));
  }

  return <div className="shell"><Sidebar/><main className="main">
    <PurchaseReceivingPanel lines={data.lines} history={history} live={!data.demo}/>
  </main></div>;
}
