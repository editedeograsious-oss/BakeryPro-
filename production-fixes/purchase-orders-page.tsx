import Sidebar from "@/components/Sidebar";
import PurchaseOrderManager from "@/components/operations/PurchaseOrderManager";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPurchaseOrderPageData } from "@/lib/repositories/operationsLive";

export const dynamic="force-dynamic";
export const revalidate=0;

export default async function PurchaseOrders(){
  const staff=await requireStaff(["owner","manager","storekeeper"]);
  const data=await getPurchaseOrderPageData();
  let orders=data.orders;
  let orderLines:any[]=[];
  let canCorrect=false;

  if(!data.demo){
    const supabase=await createClient();
    const ids=(data.orders??[]).map((o:any)=>o.id);

    let meta:any[]=[];
    if(ids.length){
      const {data:metaRows,error:mErr}=await supabase
        .from("purchases")
        .select("id,notes")
        .in("id",ids);
      if(mErr)throw mErr;
      meta=metaRows??[];

      const {data:lineRows,error:lErr}=await supabase
        .from("purchase_items")
        .select("id,purchase_id,raw_material_id,ordered_qty_base,received_qty_base,unit_cost_base,line_total")
        .in("purchase_id",ids)
        .limit(1000);
      if(lErr)throw lErr;
      orderLines=lineRows??[];
    }

    const {data:allowed,error:pErr}=await supabase.rpc("staff_has_permission",{p_permission_key:"records:correct"});
    if(pErr)throw pErr;
    canCorrect=allowed===true;

    const noteMap=new Map(meta.map((x:any)=>[x.id,x.notes]));
    orders=(data.orders??[]).map((o:any)=>({...o,notes:noteMap.get(o.id)??null}));
  }

  const canApprove=["owner","manager"].includes(staff.profile.role);

  return <div className="shell"><Sidebar/><main className="main">
    <PurchaseOrderManager
      orders={orders}
      suppliers={data.suppliers}
      materials={data.materials}
      orderLines={orderLines}
      live={!data.demo}
      canApprove={canApprove}
      canCorrect={canCorrect}
    />
  </main></div>;
}
