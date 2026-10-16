import Sidebar from "@/components/Sidebar";
import StockManagement from "@/components/operations/StockManagement";
import { requireStaff } from "@/lib/auth";
import { getInventoryPageData } from "@/lib/repositories/coreLive";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireStaff(["owner"]);
  const inventory = await getInventoryPageData();
  let products: any[] = [];
  let batches: any[] = [];
  let canPostMovements = false;
  if (!inventory.demo) {
    const supabase = await createClient();
    const p = await supabase.from("products").select("id,name,sku,status,selling_price").order("name");
    if (p.error) throw p.error;
    products = p.data ?? [];

    // Use the rich reporting view when installed; staging may have only the base table.
    const summary = await supabase.from("finished_goods_batch_summary")
      .select("*").order("production_date", {ascending:false});
    if (summary.error) {
      const missingView = ["42P01", "PGRST205", "PGRST200"].includes(summary.error.code ?? "")
        || /could not find the table.*finished_goods_batch_summary|relation.*finished_goods_batch_summary.*does not exist/i.test(summary.error.message ?? "");
      if (!missingView) throw summary.error;
      const base = await supabase.from("finished_goods_batches")
        .select("*").order("production_date", {ascending:false});
      if (base.error) throw base.error;
      batches = (base.data ?? []).map((row: any) => ({
        ...row,
        product_name: products.find((product: any) => product.id === row.product_id)?.name ?? "Product",
        quantity_issued: Math.max(0, Number(row.quantity_produced ?? 0) - Number(row.quantity_available ?? 0)),
        pos_qty_sold: 0,
        order_qty_sold: 0,
        waste_qty: 0,
        pos_revenue: 0,
        order_revenue: 0,
        pos_cogs: 0,
        order_cogs: 0,
        waste_cost: 0,
        realized_gross_profit: 0,
        detail_unavailable: true,
      }));
    } else {
      batches = summary.data ?? [];
    }

    const status = await supabase.rpc("public_ordering_status");
    if (status.error) throw status.error;
    canPostMovements = status.data === true;
  }
  return <div className="shell"><Sidebar/><main className="main">
    <StockManagement materials={inventory.materials} suppliers={inventory.suppliers}
      products={products} batches={batches} live={!inventory.demo} canPostMovements={canPostMovements}/>
  </main></div>;
}
