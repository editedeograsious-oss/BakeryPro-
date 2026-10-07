import Sidebar from "@/components/Sidebar";
import CustomerManager from "@/components/service/CustomerManager";
import { requireStaff } from "@/lib/auth";
import { getCustomersPageData } from "@/lib/repositories/customerServiceLive";
import { createClient } from "@/lib/supabase/server";
export const dynamic="force-dynamic";
export default async function Customers(){
  const staff=await requireStaff(["owner","manager","cashier"]);
  const data=await getCustomersPageData();
  let canReadCredit=true;
  if(!data.demo){
    const supabase=await createClient();
    const {data:allowed,error}=await supabase.rpc("staff_has_permission",{p_permission_key:"credit:read"});
    if(error)throw error;
    canReadCredit=allowed===true;
  }
  return <div className="shell"><Sidebar/><main className="main"><CustomerManager customers={data.customers} live={!data.demo} canPrepareOpening={["owner","manager"].includes(staff.profile.role)} canReadCredit={canReadCredit}/></main></div>;
}
