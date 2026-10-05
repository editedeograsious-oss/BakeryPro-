"use client";

import { useMemo, useState } from "react";
import { ugx } from "@/lib/costing";

export default function FinishedGoodsManager({batches}:{batches:any[]}){
  const [product,setProduct]=useState("all");

  const products=useMemo(
    ()=>Array.from(new Map(batches.map((b:any)=>[b.product_id,b.product_name])).entries()),
    [batches]
  );

  const shown=product==="all"?batches:batches.filter((b:any)=>b.product_id===product);
  const availableQty=shown.reduce((s:number,b:any)=>s+Number(b.quantity_available||0),0);
  const producedQty=shown.reduce((s:number,b:any)=>s+Number(b.quantity_produced||0),0);
  const posSold=shown.reduce((s:number,b:any)=>s+Number(b.pos_qty_sold||0),0);
  const orderSold=shown.reduce((s:number,b:any)=>s+Number(b.order_qty_sold||0),0);
  const soldQty=posSold+orderSold;
  const stockValue=shown.reduce((s:number,b:any)=>s+Number(b.quantity_available||0)*Number(b.unit_cost||0),0);
  const revenue=shown.reduce((s:number,b:any)=>s+Number(b.pos_revenue||0)+Number(b.order_revenue||0),0);
  const cogs=shown.reduce((s:number,b:any)=>s+Number(b.pos_cogs||0)+Number(b.order_cogs||0),0);
  const realizedProfit=shown.reduce((s:number,b:any)=>s+Number(b.realized_gross_profit||0),0);
  const wasteCost=shown.reduce((s:number,b:any)=>s+Number(b.waste_cost||0),0);
  const latest=shown[0]??null;

  return <>
    <div className="pagehead">
      <div>
        <h1>Finished Goods & Production Batches</h1>
        <p>Produced stock, batch costs, sales allocation, remaining units, revenue and realized profit.</p>
      </div>
    </div>

    <div className="hero">
      <h2>Production → Sales → Remaining Stock</h2>
      <p>This page follows each production batch from the kitchen to the POS. Sales reduce the oldest available batch first, so profit uses the actual historical batch cost.</p>
    </div>

    <div className="grid4">
      <div className="card stat"><div className="label">Produced Units</div><div className="value">{producedQty.toLocaleString()}</div></div>
      <div className="card stat"><div className="label">Units Sold</div><div className="value">{soldQty.toLocaleString()}</div></div>
      <div className="card stat"><div className="label">Available Units</div><div className="value">{availableQty.toLocaleString()}</div></div>
      <div className="card stat"><div className="label">Finished Stock Value</div><div className="value">{ugx(stockValue)}</div></div>
    </div>

    <div className="grid4" style={{marginTop:14}}>
      <div className="card stat"><div className="label">Sales Revenue</div><div className="value">{ugx(revenue)}</div></div>
      <div className="card stat"><div className="label">COGS Used</div><div className="value">{ugx(cogs)}</div></div>
      <div className="card stat"><div className="label">Realized Gross Profit</div><div className="value">{ugx(realizedProfit)}</div></div>
      <div className="card stat"><div className="label">Waste Cost</div><div className="value">{ugx(wasteCost)}</div></div>
    </div>

    {latest&&<div className="card" style={{marginTop:16}}>
      <div className="pagehead" style={{marginBottom:8}}>
        <div>
          <h2 style={{margin:0,color:"var(--brown)"}}>Latest Batch</h2>
          <p style={{marginTop:6}}>
            <b>{latest.batch_no}</b> • {latest.product_name} • {latest.production_date}
            {String(latest.product_name??"").startsWith("TEST -")&&<> • <span className="badge gold">TEST DATA</span></>}
          </p>
        </div>
      </div>

      <div className="grid4">
        <div className="card stat"><div className="label">Produced</div><div className="value">{Number(latest.quantity_produced||0).toLocaleString()}</div></div>
        <div className="card stat"><div className="label">Sold</div><div className="value">{(Number(latest.pos_qty_sold||0)+Number(latest.order_qty_sold||0)).toLocaleString()}</div></div>
        <div className="card stat"><div className="label">Available</div><div className="value">{Number(latest.quantity_available||0).toLocaleString()}</div></div>
        <div className="card stat"><div className="label">Unit Cost</div><div className="value">{ugx(Number(latest.unit_cost||0))}</div></div>
      </div>

      <div className="grid4" style={{marginTop:12}}>
        <div className="card stat"><div className="label">Batch Cost</div><div className="value">{ugx(Number(latest.batch_cost||0))}</div></div>
        <div className="card stat"><div className="label">Revenue</div><div className="value">{ugx(Number(latest.pos_revenue||0)+Number(latest.order_revenue||0))}</div></div>
        <div className="card stat"><div className="label">COGS</div><div className="value">{ugx(Number(latest.pos_cogs||0)+Number(latest.order_cogs||0))}</div></div>
        <div className="card stat"><div className="label">Gross Profit</div><div className="value">{ugx(Number(latest.realized_gross_profit||0))}</div></div>
      </div>
    </div>}

    <div className="card" style={{marginTop:16}}>
      <div className="field" style={{maxWidth:360,margin:0}}>
        <label>Filter product</label>
        <select value={product} onChange={e=>setProduct(e.target.value)}>
          <option value="all">All products</option>
          {products.map(([id,name])=><option key={String(id)} value={String(id)}>{String(name)}</option>)}
        </select>
      </div>
    </div>

    <div className="tablewrap" style={{marginTop:16}}>
      <table>
        <thead>
          <tr>
            <th>Batch</th><th>Product</th><th>Date</th><th>Produced</th><th>Sold</th><th>Available</th>
            <th>Unit Cost</th><th>Batch Cost</th><th>Revenue</th><th>COGS</th><th>Waste</th><th>Realized Profit</th>
          </tr>
        </thead>
        <tbody>{shown.length===0
          ?<tr><td colSpan={12}>No production batches found.</td></tr>
          :shown.map((b:any)=>{
            const sold=Number(b.pos_qty_sold||0)+Number(b.order_qty_sold||0);
            const rowRevenue=Number(b.pos_revenue||0)+Number(b.order_revenue||0);
            const rowCogs=Number(b.pos_cogs||0)+Number(b.order_cogs||0);
            return <tr key={b.id}>
              <td><b>{b.batch_no}</b>{String(b.product_name??"").startsWith("TEST -")&&<><br/><span className="badge gold">TEST</span></>}</td>
              <td>{b.product_name}</td>
              <td>{b.production_date}</td>
              <td>{Number(b.quantity_produced||0).toLocaleString()}</td>
              <td>{sold.toLocaleString()}</td>
              <td><b>{Number(b.quantity_available||0).toLocaleString()}</b></td>
              <td>{ugx(Number(b.unit_cost||0))}</td>
              <td>{ugx(Number(b.batch_cost||0))}</td>
              <td>{ugx(rowRevenue)}</td>
              <td>{ugx(rowCogs)}</td>
              <td>{Number(b.waste_qty||0).toLocaleString()} / {ugx(Number(b.waste_cost||0))}</td>
              <td><b>{ugx(Number(b.realized_gross_profit||0))}</b></td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  </>;
}
