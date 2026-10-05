import Sidebar from "@/components/Sidebar";
import CustomerOrderManager from "@/components/service/CustomerOrderManager";
import CustomerOrderPaymentCorrections from "@/components/finance/CustomerOrderPaymentCorrections";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCustomerOrdersPageData } from "@/lib/repositories/customerServiceLive";

export const dynamic="force-dynamic";

export default async function CustomerOrders(){
  const staff=await requireStaff(["owner","manager","cashier","baker"]);
  const data=await getCustomerOrdersPageData();
  let canCorrect=false;
  if(!data.demo){
    const supabase=await createClient();
    const {data:allowed}=await supabase.rpc("staff_has_permission",{p_permission_key:"records:correct"});
    canCorrect=allowed===true;
  }

  return <div className="shell"><Sidebar/><main className="main">
    <CustomerOrderManager orders={data.orders} customers={data.customers} products={data.products} shifts={data.shifts} live={!data.demo} role={staff.profile.role}/>
    <CustomerOrderPaymentCorrections live={!data.demo} canCorrect={canCorrect}/>
  </main></div>;
}
