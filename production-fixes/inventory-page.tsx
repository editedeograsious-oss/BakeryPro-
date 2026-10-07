import Sidebar from "@/components/Sidebar";
import InventoryManager from "@/components/core/InventoryManager";
import { requireStaff } from "@/lib/auth";
import { getInventoryPageData } from "@/lib/repositories/coreLive";
import { createClient } from "@/lib/supabase/server";

export const dynamic="force-dynamic";

export default async function Inventory(){
  const staff=await requireStaff(["owner","manager","storekeeper","baker"]);
  const data=await getInventoryPageData();
  const canAdjust=["owner","manager","storekeeper"].includes(staff.profile.role);
  let canPostMovements=true;
  if(!data.demo){
    const supabase=await createClient();
    const {data:allowed,error}=await supabase.rpc("public_ordering_status");
    if(error)throw error;
    canPostMovements=allowed===true;
  }

  return <div className="shell"><Sidebar/><main className="main">
    <InventoryManager materials={data.materials} suppliers={data.suppliers} live={!data.demo} canAdjust={canAdjust} canPrepareOpening={["owner","manager"].includes(staff.profile.role)} canPostMovements={canPostMovements}/>
  </main></div>;
}
