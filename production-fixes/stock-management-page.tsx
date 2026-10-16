import Sidebar from "@/components/Sidebar";
import StockManagement from "@/components/operations/StockManagement";
import { requireStaff } from "@/lib/auth";
import { getInventoryPageData } from "@/lib/repositories/coreLive";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireStaff(["owner"]);
  const inventory = await getInventoryPageData();
  const supabase = await createClient();
  let products: any[] = [];
  let batches: any[] = [];
  let canPostMovements = false;
  if (!inventory.demo) {
    const p = await supabase.from("products").select("id,name,sku,status,selling_price").order("name");
    const b = await supabase.from("finished_goods_batch_summary").select("*").order("production_date", {ascending:false});
    const s = await supabase.rpc("public_ordering_status");
    if (p.error) throw p.error;
    if (b.error) throw b.error;
    if (s.error) throw s.error;
    products = p.data ?? [];
    batches = b.data ?? [];
    canPostMovements = s.data === true;
  }
  return <div className="shell"><Sidebar/><main className="main">
    <StockManagement materials={inventory.materials} suppliers={inventory.suppliers}
       products={products} batches={batches} live={!inventory.demo} canPostMovements={canPostMovements} />
  </main></div>;
}
