import Sidebar from "@/components/Sidebar";
import CashMovementManager from "@/components/operations/CashMovementManager";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCashMovementPageData } from "@/lib/repositories/operationsLive";

export const dynamic="force-dynamic";

export default async function CashMovements(){
  const staff=await requireStaff(["owner","manager","cashier"]);
  const data=await getCashMovementPageData();
  let canCorrect=false;

  if(!data.demo){
    const supabase=await createClient();
    const {data:allowed}=await supabase.rpc("staff_has_permission",{p_permission_key:"records:correct"});
    canCorrect=allowed===true;
  }else{
    canCorrect=staff.profile.role==="owner"||staff.profile.role==="manager";
  }

  return <div className="shell"><Sidebar/><main className="main">
    <CashMovementManager
      movements={data.movements}
      shifts={data.shifts}
      live={!data.demo}
      role={staff.profile.role}
      canCorrect={canCorrect}
    />
  </main></div>;
}
