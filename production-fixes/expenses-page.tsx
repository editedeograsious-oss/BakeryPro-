import Sidebar from "@/components/Sidebar";
import ExpenseManager from "@/components/operations/ExpenseManager";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getExpensePageData } from "@/lib/repositories/operationsLive";

export const dynamic="force-dynamic";

export default async function Expenses(){
  await requireStaff(["owner","manager"]);
  const data=await getExpensePageData();
  let canCorrect=false;
  let operationsAllowed=false;
  let operationsReason="Business operations are locked.";
  let businessDate:string|undefined;
  if(!data.demo){
    const supabase=await createClient();
    const [permission,operations,date]=await Promise.all([
      supabase.rpc("staff_has_permission",{p_permission_key:"records:correct"}),
      supabase.rpc("business_operation_status"),
      supabase.rpc("business_current_date"),
    ]);
    if(permission.error)throw permission.error;
    if(date.error)throw date.error;
    canCorrect=permission.data===true;
    operationsAllowed=!operations.error&&operations.data?.allowed===true;
    operationsReason=operations.error?"Could not verify business operation status. Expense transactions are disabled.":String(operations.data?.reason??operationsReason);
    businessDate=String(date.data);
  }

  return <div className="shell"><Sidebar/><main className="main">
    <ExpenseManager expenses={data.expenses} shifts={data.shifts} live={!data.demo} canCorrect={canCorrect} operationsAllowed={operationsAllowed} operationsReason={operationsReason} businessDate={businessDate}/>
  </main></div>;
}
