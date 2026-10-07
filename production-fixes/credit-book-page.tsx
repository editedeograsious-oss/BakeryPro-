import Sidebar from "@/components/Sidebar";
import CreditBookManager from "@/components/finance/CreditBookManager";
import CreditPaymentCorrections from "@/components/finance/CreditPaymentCorrections";
import { requirePermission } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { getCreditBookData } from "@/lib/repositories/business37";

export const dynamic="force-dynamic";

export default async function CreditBook(){
  const staff=await requirePermission("credit:read",["owner","manager","cashier"]);
  const data=await getCreditBookData();
  let canCorrect=false;
  let canPostTransactions=true;
  if(!data.demo){
    const supabase=await createClient();
    const {data:allowed}=await supabase.rpc("staff_has_permission",{p_permission_key:"records:correct"});
    canCorrect=allowed===true;
    const {data:operations,error}=await supabase.rpc("public_ordering_status");
    if(error)throw error;
    canPostTransactions=operations===true;
  }

  return <div className="shell"><Sidebar/><main className="main">
    <CreditBookManager accounts={data.accounts} ledger={data.ledger} live={!data.demo} canSetTerms={["owner","manager"].includes(staff.profile.role)} canPostTransactions={canPostTransactions}/>
    <CreditPaymentCorrections live={!data.demo} canCorrect={canCorrect} canPostTransactions={canPostTransactions}/>
  </main></div>;
}
