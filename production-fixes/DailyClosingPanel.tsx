'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { createClient } from "@/lib/supabase/client";
import { ugx } from "@/lib/costing";

export default function DailyClosingPanel({snapshot,live}:{snapshot:any;live:boolean}){
  const router=useRouter();
  const [counted,setCounted]=useState(Number(snapshot.counted_cash ?? snapshot.expected_cash ?? 0));
  const [notes,setNotes]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);

  const expected=Number(snapshot.expected_cash??0);
  const variance=counted-expected;
  const openingFloat=Number(snapshot.opening_float??0);
  const cashSales=Number(snapshot.cash_sales??0);
  const cashOrderReceipts=Number(snapshot.cash_order_receipts??0);
  const cashIn=Number(snapshot.cash_in??0);
  const cashOut=Number(snapshot.cash_out??0);
  const cashExpenses=Number(snapshot.cash_expenses??0);
  const cashSupplierPayments=Number(snapshot.cash_supplier_payments??0);
  const posMomo=Number(snapshot.mtn_momo_sales??0)+Number(snapshot.airtel_money_sales??0);
  const orderMomo=Number(snapshot.mtn_order_receipts??0)+Number(snapshot.airtel_order_receipts??0);
  const supplierMomo=Number(snapshot.mtn_supplier_payments??0)+Number(snapshot.airtel_supplier_payments??0);
  const totalSales=Number(snapshot.total_sales??0);
  const orderReceipts=Number(snapshot.customer_order_receipts??0);

  async function closeDay(){
    if(snapshot.status==="closed"){setMessage("This business day is already closed.");return;}
    if(counted<0){setMessage("Counted cash cannot be negative.");return;}
    if(!live){setMessage("Demo mode: closing simulated. No database snapshot was locked.");return;}

    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {error}=await supabase.rpc("close_business_day",{
        p_business_date:snapshot.business_date,
        p_counted_cash:counted,
        p_notes:notes.trim()||null,
      });
      if(error)throw error;
      setMessage("Business day closed and audit snapshot saved.");
      router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not close day.");}
    finally{setBusy(false);}
  }

  return <div className="shell"><Sidebar/><main className="main">
    <div className="pagehead">
      <div><h1>Daily Closing</h1><p>Business-day cash and payment reconciliation for {snapshot.business_date}.</p></div>
      <button className="btn primary" disabled={busy||snapshot.status==="closed"} onClick={closeDay}>
        {snapshot.status==="closed"?"Day Closed":busy?"Closing...":"Close Day"}
      </button>
    </div>

    {message&&<div className="hero" style={{padding:14}}><b>{message}</b></div>}

    <div className="grid4">
      <div className="card stat"><div className="label">Net POS Sales</div><div className="value">{ugx(totalSales)}</div></div>
      <div className="card stat"><div className="label">Opening Float</div><div className="value">{ugx(openingFloat)}</div></div>
      <div className="card stat"><div className="label">Expected Cash</div><div className="value">{ugx(expected)}</div></div>
      <div className="card stat"><div className="label">POS Transactions</div><div className="value">{Number(snapshot.transaction_count??0)}</div></div>
    </div>

    <div className="hero" style={{marginTop:16}}>
      <h2>Cash Formula</h2>
      <p style={{fontSize:16}}>
        <b>{ugx(openingFloat)}</b> opening float
        {" + "}<b>{ugx(cashSales)}</b> POS cash
        {" + "}<b>{ugx(cashOrderReceipts)}</b> order cash
        {" + "}<b>{ugx(cashIn)}</b> cash in
        {" - "}<b>{ugx(cashOut)}</b> cash out
        {" - "}<b>{ugx(cashExpenses)}</b> cash expenses
        {" - "}<b>{ugx(cashSupplierPayments)}</b> supplier cash
        {" = "}<b>{ugx(expected)}</b> expected cash.
      </p>
    </div>

    <div className="grid2" style={{marginTop:16}}>
      <div className="card">
        <h3 style={{color:"var(--brown)",marginTop:0}}>Cash Reconciliation</h3>
        <p style={{display:"flex",justifyContent:"space-between"}}><span>Opening float</span><b>{ugx(openingFloat)}</b></p>
        <p style={{display:"flex",justifyContent:"space-between"}}><span>Net POS cash</span><b>{ugx(cashSales)}</b></p>
        <p style={{display:"flex",justifyContent:"space-between"}}><span>Customer-order cash receipts</span><b>{ugx(cashOrderReceipts)}</b></p>
        <p style={{display:"flex",justifyContent:"space-between"}}><span>Cash in</span><b>{ugx(cashIn)}</b></p>
        <p style={{display:"flex",justifyContent:"space-between"}}><span>Cash out</span><b>- {ugx(cashOut)}</b></p>
        <p style={{display:"flex",justifyContent:"space-between"}}><span>Cash expenses</span><b>- {ugx(cashExpenses)}</b></p>
        <p style={{display:"flex",justifyContent:"space-between"}}><span>Cash supplier payments</span><b>- {ugx(cashSupplierPayments)}</b></p>
        <hr style={{border:0,borderTop:"1px solid var(--line)"}}/>
        <p style={{display:"flex",justifyContent:"space-between",fontSize:20}}><span><b>Expected cash</b></span><b>{ugx(expected)}</b></p>
        <div className="field"><label>Counted cash</label><input type="number" min="0" value={counted} onChange={e=>setCounted(Number(e.target.value))}/></div>
        <p style={{display:"flex",justifyContent:"space-between",fontSize:18}}><span><b>Variance</b></span><b style={{color:variance===0?"var(--green)":"var(--red)"}}>{variance>=0?"+ ":"- "}{ugx(Math.abs(variance))}</b></p>
        <span className={variance===0?"badge green":"badge red"}>{variance===0?"Balanced":variance>0?"Over":"Short"}</span>
      </div>

      <div className="card">
        <h3 style={{color:"var(--brown)",marginTop:0}}>Payment Reconciliation</h3>
        <p style={{display:"flex",justifyContent:"space-between"}}><span>Customer Order Receipts</span><b>{ugx(orderReceipts)}</b></p>
        <p style={{display:"flex",justifyContent:"space-between"}}><span>POS Mobile Money</span><b>{ugx(posMomo)}</b></p>
        <p style={{display:"flex",justifyContent:"space-between"}}><span>Customer-order Mobile Money</span><b>{ugx(orderMomo)}</b></p>
        <p style={{display:"flex",justifyContent:"space-between"}}><span>MoMo expenses</span><b>- {ugx(Number(snapshot.momo_expenses??0))}</b></p>
        <p style={{display:"flex",justifyContent:"space-between"}}><span>MoMo supplier payments</span><b>- {ugx(supplierMomo)}</b></p>
        <p style={{display:"flex",justifyContent:"space-between"}}><span>Bank sales</span><b>{ugx(Number(snapshot.bank_sales??0))}</b></p>
        <hr style={{border:0,borderTop:"1px solid var(--line)"}}/>
        <p><b>Refunds, customer-order receipts and supplier settlements are included in payment-method reconciliation.</b></p>
        <p style={{color:"var(--muted)",fontSize:12}}>Manual Mobile Money references should still be compared with provider statements until an official API is connected.</p>
      </div>
    </div>

    <div className="card" style={{marginTop:16}}>
      <h3 style={{color:"var(--brown)",marginTop:0}}>Closing Notes</h3>
      <div className="field"><label>Manager / Owner note</label><input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Shortage/overage reason or handover note"/></div>
      <p style={{color:"var(--muted)",fontSize:12}}>Status: <b>{snapshot.status}</b>. Closed snapshots remain preserved for reports and audit.</p>
    </div>
  </main></div>;
}
