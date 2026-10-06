import Sidebar from "@/components/Sidebar";
import PurchaseOrderManager from "@/components/operations/PurchaseOrderManager";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPurchaseOrderPageData } from "@/lib/repositories/operationsLive";

export const dynamic="force-dynamic";

export default async function PurchaseOrders(){
  const staff=await requireStaff(["owner","manager","storekeeper"]);
  const data=await getPurchaseOrderPageData();
  const canApprove=["owner","manager"].includes(staff.profile.role);

  let operationsAllowed=true;
  let operationsReason="Business operations are enabled";
  if(!data.demo){
    const supabase=await createClient();
    const {data:status}=await supabase.rpc("business_operation_status");
    operationsAllowed=status?.allowed===true;
    operationsReason=String(status?.reason??"Business operations are currently unavailable");
  }

  return <div className="shell"><Sidebar/><main className="main">
    <PurchaseOrderManager
      orders={data.orders}
      suppliers={data.suppliers}
      materials={data.materials}
      live={!data.demo}
      canApprove={canApprove}
      operationsAllowed={operationsAllowed}
      operationsReason={operationsReason}
    />
  </main></div>;
}
