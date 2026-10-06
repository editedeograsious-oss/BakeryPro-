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
  let operationsAllowed=true;
  let operationsReason="Business operations are enabled";

  if(!data.demo){
    const supabase=await createClient();
    const [{data:allowed},{data:status}]=await Promise.all([
      supabase.rpc("staff_has_permission",{p_permission_key:"records:correct"}),
      supabase.rpc("business_operation_status")
    ]);
    canCorrect=allowed===true;
    operationsAllowed=status?.allowed===true;
    operationsReason=String(status?.reason??"Business operations are currently unavailable");
  }

  return <div className="shell"><Sidebar/><main className="main">
    <SupplierAccountsPanel
      accounts={data.accounts}
      statements={data.statements}
      payables={data.payables}
      shifts={data.shifts}
      live={!data.demo}
      operationsAllowed={operationsAllowed}
      operationsReason={operationsReason}
    />
    <SupplierPaymentCorrections
      live={!data.demo}
      canCorrect={canCorrect}
      operationsAllowed={operationsAllowed}
      operationsReason={operationsReason}
      refreshKey={JSON.stringify(data.statements.map((s:any)=>[s.source_id,s.credit,s.edited_at,s.voided_at]))}
    />
  </main></div>;
}
