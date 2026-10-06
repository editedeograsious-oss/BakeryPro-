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
  let canManage=false;
  let operationsAllowed=false;
  let operationsReason="Business operations are locked.";

  if(!data.demo){
    const supabase=await createClient();
    let meta:any[]=[];
    const baseItems=data.items??[];
    if(baseItems.length>0){
      const {data:rows,error:metaError}=await supabase
        .from("payroll_items")
        .select("id,voided_at,void_reason,restored_at,restore_reason,reopened_at,reopen_reason")
        .in("id",baseItems.map((x:any)=>x.id));
      if(metaError)throw metaError;
      meta=rows??[];
    }

    const [correction,management,operations,allocations]=await Promise.all([
      supabase.rpc("staff_has_permission",{p_permission_key:"records:correct"}),
      supabase.rpc("staff_has_permission",{p_permission_key:"payroll:manage"}),
      supabase.rpc("business_operation_status"),
      baseItems.length>0?supabase.from("payroll_advance_allocations").select("payroll_item_id,amount").in("payroll_item_id",baseItems.map((x:any)=>x.id)):Promise.resolve({data:[],error:null}),
    ]);
    const {data:allowed,error:permissionError}=correction;
    if(permissionError)throw permissionError;
    if(management.error)throw management.error;
    if(allocations.error)throw allocations.error;

    const byId=new Map(meta.map((x:any)=>[x.id,x]));
    const allocated=new Map<string,number>();
    (allocations.data??[]).forEach((x:any)=>allocated.set(x.payroll_item_id,(allocated.get(x.payroll_item_id)??0)+Number(x.amount)));
    items=baseItems.map((x:any)=>({...x,...(byId.get(x.id)??{}),advance_history_ready:Number(x.advance_deduction||0)===0||Math.abs((allocated.get(x.id)??0)-Number(x.advance_deduction))<0.01}));
    canCorrect=allowed===true;
    canManage=management.data===true;
    operationsAllowed=!operations.error&&operations.data?.allowed===true;
    operationsReason=operations.error?"Could not verify business operation status. Payroll transactions are disabled.":String(operations.data?.reason??operationsReason);
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
      canManage={canManage}
      operationsAllowed={operationsAllowed}
      operationsReason={operationsReason}
    />
  </main></div>;
}
