import Sidebar from "@/components/Sidebar";
import WasteManager from "@/components/operations/WasteManager";
import WasteCorrections from "@/components/finance/WasteCorrections";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getWastePageData } from "@/lib/repositories/operationsLive";

export const dynamic="force-dynamic";

export default async function Waste(){
  const staff=await requireStaff(["owner","manager","baker","storekeeper"]);
  const data=await getWastePageData();
  let canCorrect=false;
  if(!data.demo){
    const supabase=await createClient();
    const {data:allowed}=await supabase.rpc("staff_has_permission",{p_permission_key:"records:correct"});
    canCorrect=allowed===true;
  }

  return <div className="shell"><Sidebar/><main className="main">
    <WasteManager events={data.events} products={data.products} materials={data.materials} runs={data.runs} threshold={data.threshold} live={!data.demo} role={staff.profile.role}/>
    <WasteCorrections live={!data.demo} canCorrect={canCorrect}/>
  </main></div>;
}
