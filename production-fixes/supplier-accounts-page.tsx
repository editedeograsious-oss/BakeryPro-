import Sidebar from "@/components/Sidebar";
import SupplierAccountsPanel from "@/components/operations/SupplierAccountsPanel";
import SupplierPaymentCorrections from "@/components/finance/SupplierPaymentCorrections";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSupplierAccountsPageData } from "@/lib/repositories/operationsLive";

export const dynamic="force-dynamic";

export default async function SupplierAccounts(){
  await requireStaff(["owner","manager"]);
  const data=await getSupplierAccountsPageData();
  let canCorrect=false;
  if(!data.demo){
    const supabase=await createClient();
    const {data:allowed}=await supabase.rpc("staff_has_permission",{p_permission_key:"records:correct"});
    canCorrect=allowed===true;
  }

  return <div className="shell"><Sidebar/><main className="main">
    <SupplierAccountsPanel accounts={data.accounts} statements={data.statements} payables={data.payables} shifts={data.shifts} live={!data.demo}/>
    <SupplierPaymentCorrections live={!data.demo} canCorrect={canCorrect} refreshKey={data.statements.map((row:any)=>`${row.source_id}:${row.credit}:${row.edited_at??""}:${row.voided_at??""}`).join("|")}/>
  </main></div>;
}
