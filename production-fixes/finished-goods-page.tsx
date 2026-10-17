import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import FinishedStockIn from "@/components/operations/FinishedStockIn";
import {requireStaff} from "@/lib/auth";
import {createClient} from "@/lib/supabase/server";

export const dynamic="force-dynamic";

export default async function FinishedGoodsPage(){
  const staff=await requireStaff(["owner","manager","storekeeper","baker"]);
  const supabase=await createClient();
  // Query the real base tables. The optional finished_goods_batch_summary view
  // is absent from staging and caused a Server Components crash (PGRST205).
  const [productsResult,batchesResult]=await Promise.all([
    supabase.from("products").select("id,name,status,selling_price").order("name"),
    supabase.from("finished_goods_batches")
      .select("id,batch_no,product_id,production_date,quantity_produced,quantity_available,batch_cost,unit_cost,source_type,manual_reason,branch_id,created_at")
      .order("production_date",{ascending:false}).limit(250)
  ]);
  if(productsResult.error)throw new Error("Cannot load finished product catalogue: "+productsResult.error.message);
  if(batchesResult.error)throw new Error("Cannot load finished goods batches: "+batchesResult.error.message);
  const products=productsResult.data??[];
  const batches=batchesResult.data??[];
  const names=new Map(products.map(p=>[p.id,p.name]));
  const total=batches.reduce((n,b)=>n+Number(b.quantity_available??0),0);
  const cost=batches.reduce((n,b)=>n+Number(b.quantity_available??0)*Number(b.unit_cost??0),0);
  const isOwner=staff.profile.role==="owner";

  return <div className="shell">
    <Sidebar/>
    <main className="main">
      <div className="pagehead">
        <div>
          <h1>Finished Goods & Batches</h1>
          <p>Available bakery products recorded in the shared database, including production and manually counted opening stock.</p>
        </div>
        <div className="action-row">
          <Link className="btn secondary" href="/production">Daily Bake Plan</Link>
          <Link className="btn secondary" href="/pos">Sales / POS</Link>
          {isOwner&&<Link className="btn secondary" href="/stock-management">Stock Management</Link>}
        </div>
      </div>
      <div className="grid4" style={{marginBottom:20}}>
        <div className="card stat"><div className="label">Finished units available</div><div className="value">{total.toLocaleString()}</div></div>
        <div className="card stat"><div className="label">Recorded batches</div><div className="value">{batches.length.toLocaleString()}</div></div>
        <div className="card stat"><div className="label">Available stock cost</div><div className="value">UGX {cost.toLocaleString("en-US",{maximumFractionDigits:2})}</div></div>
        <div className="card stat"><div className="label">Stock types</div><div>Daily production + audited manual opening stock</div></div>
      </div>
      {isOwner&&<FinishedStockIn products={products}/>}
      {!isOwner&&<p>To record stock, ask the CEO to add manually counted opening stock, or confirm a normal production run.</p>}
      <section className="card" style={{padding:18}}>
        <h2>Available finished stock</h2>
        <p>Finished stock is reduced by completed POS sales, fulfilled customer orders, and recorded waste.
          Manual entries are labeled separately from production runs.</p>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Batch</th><th>Product</th><th>Source</th><th>Stock date</th><th>Received</th><th>Available</th><th>Unit cost</th><th>Stock cost</th></tr></thead>
            <tbody>
              {batches.length===0?
                <tr><td colSpan={8}>No finished stock has been recorded. The CEO can add opening stock above or confirm products in the Daily Bake Plan.</td></tr>
                :batches.map(b=><tr key={b.id}>
                  <td>{b.batch_no}</td>
                  <td>{names.get(b.product_id)??"Product"}</td>
                  <td>{b.source_type==="manual"?
                    <><strong>Manual / opening</strong>{b.manual_reason&&<div><small>{b.manual_reason}</small></div>}</>:
                    "Confirmed production"}</td>
                  <td>{b.production_date}</td>
                  <td>{Number(b.quantity_produced).toLocaleString()}</td>
                  <td><strong>{Number(b.quantity_available).toLocaleString()}</strong></td>
                  <td>UGX {Number(b.unit_cost).toLocaleString("en-US")}</td>
                  <td>UGX {(Number(b.quantity_available)*Number(b.unit_cost)).toLocaleString("en-US")}</td>
                </tr>)}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  </div>;
}
