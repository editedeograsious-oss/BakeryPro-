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
  if(!data.demo){
    const supabase=await createClient();
    const {data:allowed}=await supabase.rpc("staff_has_permission",{p_permission_key:"records:correct"});
    canCorrect=allowed===true;
  }

  return <div className="shell"><Sidebar/><main className="main">
    <ExpenseManager expenses={data.expenses} shifts={data.shifts} live={!data.demo} canCorrect={canCorrect}/>
  </main></div>;
}
