import Sidebar from "@/components/Sidebar";
import StockMovementLedger from "@/components/admin/StockMovementLedger";
import StockCountCorrections from "@/components/finance/StockCountCorrections";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getStockMovementLedgerData } from "@/lib/repositories/operationsLive";

export const dynamic="force-dynamic";

export default async function StockMovements(){
  await requireStaff(["owner","manager","storekeeper"]);
  const data=await getStockMovementLedgerData();
  let canCorrect=false;
  if(!data.demo){
    const supabase=await createClient();
    const {data:allowed}=await supabase.rpc("staff_has_permission",{p_permission_key:"records:correct"});
    canCorrect=allowed===true;
  }

  return <div className="shell"><Sidebar/><main className="main">
    <StockMovementLedger rows={data.rows}/>
    <StockCountCorrections live={!data.demo} canCorrect={canCorrect}/>
  </main></div>;
}
