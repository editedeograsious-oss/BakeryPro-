"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import InventoryManager from "@/components/core/InventoryManager";
import FinishedGoodsManager from "@/components/operations/FinishedGoodsManager";
import { ugx } from "@/lib/costing";

type StockTab = "overview" | "materials" | "finished";
type ItemRow = {
  id: string;
  name: string;
  kind: "material" | "finished";
  unit: string;
  available: number;
  status: string;
  low: boolean;
  value: number;
  productPrice?: number;
};

export default function StockManagement({
  materials, suppliers, products, batches, live, canPostMovements
}: {
  materials: any[];
  suppliers: any[];
  products: any[];
  batches: any[];
  live: boolean;
  canPostMovements: boolean;
}) {
  const [tab, setTab] = useState<StockTab>("overview");
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const rows = useMemo<ItemRow[]>(() => {
    const raw = materials.map((m: any) => ({
      id: m.id,
      name: m.name ?? "Unnamed material",
      kind: "material" as const,
      unit: m.base_unit ?? "units",
      available: Number(m.current_stock_qty ?? 0),
      status: m.status ?? "active",
      low: Boolean(m.low) || Number(m.current_stock_qty ?? 0) <= Number(m.low_stock_threshold ?? 0),
      value: Number(m.stock_value ?? 0),
    }));
    const goods = products.map((p: any) => {
      const productBatches = batches.filter((b: any) => b.product_id === p.id);
      const available = productBatches.reduce((total: number, b: any) => total + Number(b.quantity_available ?? 0), 0);
      const value = productBatches.reduce((total: number, b: any) => total + Number(b.quantity_available ?? 0) * Number(b.unit_cost ?? 0), 0);
      return {
        id: p.id,
        name: p.name ?? "Unnamed product",
        kind: "finished" as const,
        unit: "pcs",
        available,
        status: p.status ?? "active",
        low: false,
        value,
        productPrice: Number(p.selling_price ?? 0),
      };
    });
    return [...raw, ...goods].sort((a, b) => a.name.localeCompare(b.name));
  }, [materials, batches, products]);

  const filtered = useMemo(() => rows.filter(item =>
    (kind === "all" || item.kind === kind) &&
    item.name.toLowerCase().includes(search.trim().toLowerCase())
  ), [rows, kind, search]);
  const lowCount = rows.filter(item => item.kind === "material" && item.low && item.status === "active").length;
  const stockValue = rows.reduce((total, item) => total + item.value, 0);
  const availableFinished = rows.filter(item => item.kind === "finished").reduce((total, item) => total + item.available, 0);

  const tabButton = (target: StockTab, label: string) =>
    <button type="button" className={"btn " + (tab === target ? "primary" : "secondary")} onClick={() => setTab(target)}>{label}</button>;

  return <>
    <div className="pagehead">
      <div>
        <h1>Stock Management</h1>
        <p>One CEO workspace for ingredients, packaging materials, finished products and stock corrections.</p>
      </div>
      <div className="action-row">
        <Link className="btn secondary" href="/recipes">Recipes & Costing</Link>
        <Link className="btn primary" href="/finished-goods">+ Add Finished Stock</Link>
        <Link className="btn secondary" href="/production">Production</Link>
      </div>
    </div>

    {!canPostMovements && <div className="hero" style={{padding:14,marginBottom:16}}>
      <strong>Setup mode:</strong> You can register and edit products and raw materials. Posting new stock movements,
      finished production and sales is protected until the owner completes the production go-live checks.
    </div>}

    <div className="grid4">
      <div className="card stat"><div className="label">Material Items</div><div className="value">{materials.length}</div></div>
      <div className="card stat"><div className="label">Finished Units Available</div><div className="value">{availableFinished.toLocaleString()}</div></div>
      <div className="card stat"><div className="label">Low Stock Materials</div><div className="value">{lowCount}</div></div>
      <div className="card stat"><div className="label">Estimated Stock Cost</div><div className="value">{ugx(stockValue)}</div></div>
    </div>

    <div className="action-row" style={{marginTop:18, marginBottom:16}}>
      {tabButton("overview", "All Stock")}
      {tabButton("materials", "Ingredients & Packaging")}
      {tabButton("finished", "Finished Goods & Batches")}
    </div>

    {tab === "overview" && <>
      <div className="card">
        <div className="grid2">
          <div className="field">
            <label htmlFor="stock-search">Search stock items</label>
            <input id="stock-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Flour, bags, cakes, bread..." />
          </div>
          <div className="field">
            <label htmlFor="stock-kind">Item type</label>
            <select id="stock-kind" value={kind} onChange={e=>setKind(e.target.value)}>
              <option value="all">All stock</option>
              <option value="material">Ingredients and packaging</option>
              <option value="finished">Finished products</option>
            </select>
          </div>
        </div>
        <p style={{color:"var(--muted)",marginBottom:0}}>
          Packaging (boxes, bags, wrappers) is registered as a raw material with a unit such as pcs.
          Finished goods come from confirmed production batches; quantities are not edited directly.
        </p>
      </div>
      <div className="tablewrap" style={{marginTop:16}}>
        <table>
          <thead><tr><th>Item</th><th>Type</th><th>Available</th><th>Stock Cost</th><th>Status</th><th>CEO Actions</th></tr></thead>
          <tbody>
            {filtered.length===0?<tr><td colSpan={6}>No stock items match this filter.</td></tr>:filtered.map(item =>
              <tr key={item.kind + item.id}>
                <td><b>{item.name}</b>{item.kind==="finished" && item.productPrice!==undefined ? <><br/><small>Selling price: {ugx(item.productPrice)}</small></> : null}</td>
                <td>{item.kind === "material" ? "Ingredient / Packaging" : "Finished product"}</td>
                <td>{item.available.toLocaleString()} {item.unit}</td>
                <td>{ugx(item.value)}</td>
                <td>{item.status !== "active" ? <span className="badge gold">Archived</span> : item.low ? <span className="badge red">Low stock</span> : item.kind === "finished" && item.available <= 0 ? <span className="badge gold">No available batch</span> : <span className="badge green">Active</span>}</td>
                <td>
                  <button className="btn secondary" type="button" onClick={()=>setTab(item.kind === "material" ? "materials" : "finished")}>
                    {item.kind === "material" ? "Edit / Delete / Adjust" : "View Batches"}
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="action-row" style={{marginTop:18}}>
        <button type="button" className="btn primary" onClick={()=>setTab("materials")}>+ Add Ingredient / Packaging</button>
        <Link className="btn secondary" href="/products">+ Add Finished Product</Link>
        <Link className="btn secondary" href="/recycle-bin">Recycle Bin / Restore</Link>
      </div>
    </>}

    {tab === "materials" && <InventoryManager
      materials={materials}
      suppliers={suppliers}
      live={live}
      canAdjust={true}
      canPrepareOpening={true}
      canPostMovements={canPostMovements}
    />}

    {tab === "finished" && <>
      <div className="hero" style={{padding:14,marginBottom:16}}>
        To add finished stock, first create a product and recipe, then confirm a production batch.
        For sold or wasted stock, use the existing correction or refund workflow so financial records remain consistent.
        <div className="action-row" style={{marginTop:12}}>
          <Link className="btn primary" href="/finished-goods">+ Add Finished Stock</Link>
          <Link className="btn primary" href="/products">Manage Products</Link>
          <Link className="btn secondary" href="/production">Manage Production</Link>
          <Link className="btn secondary" href="/waste">Record Waste</Link>
        </div>
      </div>
      <FinishedGoodsManager batches={batches}/>
    </>}
  </>;
}
