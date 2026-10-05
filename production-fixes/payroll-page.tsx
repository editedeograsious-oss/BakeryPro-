import Sidebar from "@/components/Sidebar";
import PayrollManager from "@/components/finance/PayrollManager";
import { requirePermission } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { getPayrollData } from "@/lib/repositories/business37";

export const dynamic="force-dynamic";
export const revalidate=0;

export default async function PayrollPage(){
  await requirePermission("payroll:read",["owner","manager"]);
  const data=await getPayrollData();

  let items=data.items;
  let canCorrect=false;

  if(!data.demo){
    const supabase=await createClient();
    const [{data:meta,error:metaError},{data:allowed,error:permissionError}]=await Promise.all([
      supabase
        .from("payroll_items")
        .select("id,voided_at,void_reason,restored_at,restore_reason,reopened_at,reopen_reason")
        .in("id",(data.items??[]).map((x:any)=>x.id)),
      supabase.rpc("staff_has_permission",{p_permission_key:"records:correct"}),
    ]);

    if(metaError && (data.items??[]).length>0)throw metaError;
    if(permissionError)throw permissionError;

    const byId=new Map((meta??[]).map((x:any)=>[x.id,x]));
    items=(data.items??[]).map((x:any)=>({...x,...(byId.get(x.id)??{})}));
    canCorrect=allowed===true;
  }

  return <div className="shell"><Sidebar/><main className="main">
    <PayrollManager
      staff={data.staff}
      compensation={data.compensation}
      runs={data.runs}
      items={items}
      advances={data.advances}
      live={!data.demo}
      canCorrect={canCorrect}
    />
  </main></div>;
}
