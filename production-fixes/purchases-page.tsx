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
  let history:any[]=data.lines??[];
  let operationsAllowed=data.demo;
  let operationsReason=data.demo?"Demo mode":"Business operation status is unavailable";

  if(!data.demo){
    const supabase=await createClient();
    const [{data:rows,error},{data:status}]=await Promise.all([supabase
      .from("purchases")
      .select("id,purchase_no,purchase_date,status,approval_status,supplier_id,suppliers(name),purchase_items(id,raw_material_id,ordered_qty_base,received_qty_base,unit_cost_base,line_total,raw_materials(name,base_unit))")
      .eq("approval_status","approved")
      .in("status",["ordered","partially_received","received"])
      .order("purchase_date",{ascending:false})
      .order("created_at",{ascending:false})
      .limit(100),supabase.rpc("business_operation_status")]);
    if(error)throw error;
    operationsAllowed=status?.allowed===true;
    operationsReason=String(status?.reason??"Business operations are currently unavailable");
    history=(rows??[]).flatMap((purchase:any)=>(purchase.purchase_items??[]).map((line:any)=>({
      ...line,purchase_id:purchase.id,purchase_no:purchase.purchase_no,purchase_date:purchase.purchase_date,
      status:purchase.status,approval_status:purchase.approval_status,supplier_id:purchase.supplier_id,
      supplier_name:purchase.suppliers?.name,material_name:line.raw_materials?.name,
      base_unit:line.raw_materials?.base_unit,remaining_qty_base:Number(line.ordered_qty_base)-Number(line.received_qty_base),
    })));
  }

  return <div className="shell"><Sidebar/><main className="main">
    <PurchaseReceivingPanel lines={data.lines} history={history} live={!data.demo} operationsAllowed={operationsAllowed} operationsReason={operationsReason}/>
  </main></div>;
}
