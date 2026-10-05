'use client';

import { useRouter } from "next/navigation";
import { ugx } from "@/lib/costing";

export default function LiveManagementReport({period,summary,products,payments,expenses}:{period:"week"|"month";summary:any;products:any[];payments:any[];expenses:any[]}){
  const router=useRouter();
  const setPeriod=(p:string)=>router.push(`/reports?period=${p}`);

  return <>
    <div className="pagehead">
      <div><h1>Financial Reports</h1><p>Live sales, COGS, profit, expenses, production and payment performance.</p></div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <button className={period==="week"?"btn primary":"btn secondary"} onClick={()=>setPeriod("week")}>This Week</button>
        <button className={period==="month"?"btn primary":"btn secondary"} onClick={()=>setPeriod("month")}>This Month</button>
        <button className="btn secondary" onClick={()=>window.print()}>Print / Save PDF</button>
      </div>
    </div>

    <div className="grid4">
      <div className="card stat"><div className="label">Net POS Sales</div><div className="value">{ugx(Number(summary.sales||0))}</div></div>
      <div className="card stat"><div className="label">COGS</div><div className="value">{ugx(Number(summary.cogs||0))}</div></div>
      <div className="card stat"><div className="label">Gross Profit</div><div className="value">{ugx(Number(summary.gross_profit||0))}</div></div>
      <div className="card stat"><div className="label">Estimated Operating Profit</div><div className="value">{ugx(Number(summary.operating_profit||0))}</div></div>
    </div>

    <div className="grid4" style={{marginTop:14}}>
      <div className="card stat"><div className="label">POS Transactions</div><div className="value">{Number(summary.transactions||0).toLocaleString()}</div></div>
      <div className="card stat"><div className="label">Recorded Expenses</div><div className="value">{ugx(Number(summary.expenses||0))}</div></div>
      <div className="card stat"><div className="label">Purchases</div><div className="value">{ugx(Number(summary.purchases||0))}</div></div>
      <div className="card stat"><div className="label">Approved Waste Cost</div><div className="value">{ugx(Number(summary.waste_cost||0))}</div></div>
    </div>

    <div className="grid4" style={{marginTop:14}}>
      <div className="card stat"><div className="label">Production Planned</div><div className="value">{Number(summary.production_planned||0).toLocaleString()}</div></div>
      <div className="card stat"><div className="label">Production Produced</div><div className="value">{Number(summary.production_produced||0).toLocaleString()}</div></div>
      <div className="card stat"><div className="label">Customer Orders</div><div className="value">{ugx(Number(summary.customer_order_value||0))}</div></div>
      <div className="card stat"><div className="label">Customer Balances</div><div className="value">{ugx(Number(summary.customer_order_outstanding||0))}</div></div>
    </div>

    <div className="grid2" style={{marginTop:16}}>
      <div className="card">
        <h3 style={{color:"var(--brown)",marginTop:0}}>Product Performance</h3>
        {products.length===0
          ?<p style={{color:"var(--muted)"}}>Product performance will appear after completed sales.</p>
          :products.map((p:any)=><div key={p.product_id} style={{padding:"10px 0",borderBottom:"1px solid var(--line)"}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:12}}>
              <div><b>{p.product_name}</b>{String(p.product_name??"").startsWith("TEST -")&&<><br/><span className="badge gold">TEST DATA</span></>}</div>
              <b>{ugx(Number(p.sales_amount))}</b>
            </div>
            <div style={{marginTop:6,color:"var(--muted)",fontSize:13}}>
              {Number(p.units||0).toLocaleString()} units sold | Gross profit {ugx(Number(p.gross_profit||0))}
            </div>
          </div>)}
      </div>

      <div className="card">
        <h3 style={{color:"var(--brown)",marginTop:0}}>Payment Mix</h3>
        {payments.length===0
          ?<p style={{color:"var(--muted)"}}>Payment mix will populate from completed payment ledgers.</p>
          :payments.map((p:any)=><p key={p.method} style={{display:"flex",justifyContent:"space-between"}}><span>{String(p.method).replaceAll("_"," ")}</span><b>{ugx(Number(p.amount))}</b></p>)}
      </div>
    </div>

    <div className="grid2" style={{marginTop:16}}>
      <div className="card">
        <h3 style={{color:"var(--brown)",marginTop:0}}>Supplier Position</h3>
        <p style={{display:"flex",justifyContent:"space-between"}}><span>Outstanding</span><b>{ugx(Number(summary.supplier_outstanding||0))}</b></p>
        <p style={{display:"flex",justifyContent:"space-between"}}><span>Overdue</span><b>{ugx(Number(summary.supplier_overdue||0))}</b></p>
      </div>
      <div className="card">
        <h3 style={{color:"var(--brown)",marginTop:0}}>Profit Formula</h3>
        <p><b>Gross Profit = Sales - COGS</b></p>
        <p style={{color:"var(--muted)"}}>{ugx(Number(summary.sales||0))} - {ugx(Number(summary.cogs||0))} = {ugx(Number(summary.gross_profit||0))}</p>
        <p><b>Operating Profit = Gross Profit - Recorded Expenses</b></p>
        <p style={{color:"var(--muted)"}}>{ugx(Number(summary.gross_profit||0))} - {ugx(Number(summary.expenses||0))} = {ugx(Number(summary.operating_profit||0))}</p>
      </div>
    </div>

    <div className="hero" style={{marginTop:16}}>
      <h2>Accounting note</h2>
      <p>Gross profit uses historical sale-item cost snapshots. Estimated operating profit subtracts recorded operating expenses; supplier settlements are cashflow and are not treated as operating expenses.</p>
    </div>
  </>;
}
