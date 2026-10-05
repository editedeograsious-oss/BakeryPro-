'use client';

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ugx } from "@/lib/costing";

export default function SupplierAccountsPanel({
  accounts,statements,payables,shifts,live
}:{
  accounts:any[];statements:any[];payables:any[];shifts:any[];live:boolean;
}){
  const router=useRouter();
  const [supplierId,setSupplierId]=useState(accounts[0]?.supplier_id??"");
  const supplierPayables=payables.filter(p=>p.supplier_id===supplierId);
  const [purchaseId,setPurchaseId]=useState(supplierPayables[0]?.id??"");
  const [amount,setAmount]=useState(0);
  const [method,setMethod]=useState("bank");
  const [reference,setReference]=useState("");
  const [shiftId,setShiftId]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const requestId=useRef(crypto.randomUUID());

  const current=accounts.find(a=>a.supplier_id===supplierId);
  const currentPurchase=payables.find(p=>p.id===purchaseId);
  const supplierStatement=statements.filter(s=>s.supplier_id===supplierId).slice(0,50);
  const totalBalance=useMemo(()=>accounts.reduce((s,a)=>s+Number(a.outstanding_balance||0),0),[accounts]);
  const overdue=useMemo(()=>accounts.reduce((s,a)=>s+Number(a.overdue_balance||0),0),[accounts]);
  const totalPurchases=useMemo(()=>accounts.reduce((s,a)=>s+Number(a.total_purchases||0),0),[accounts]);
  const totalPaid=useMemo(()=>accounts.reduce((s,a)=>s+Number(a.total_paid||0),0),[accounts]);

  function chooseSupplier(id:string){
    setSupplierId(id);
    const next=payables.find(p=>p.supplier_id===id);
    setPurchaseId(next?.id??"");
    setAmount(0);
  }

  async function pay(){
    if(!purchaseId){setMessage("Select an outstanding purchase.");return;}
    if(amount<=0){setMessage("Payment amount must be greater than zero.");return;}
    if(currentPurchase&&amount>Number(currentPurchase.outstanding_amount)){setMessage("Payment exceeds the selected purchase balance.");return;}
    if(method!=="cash"&&!reference.trim()){setMessage("Enter a reference for bank/Mobile Money payment.");return;}
    if(!live){setMessage("Demo mode: supplier payment simulated.");return;}
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {data,error}=await supabase.rpc("record_supplier_payment",{
        p_purchase_id:purchaseId,
        p_amount:amount,
        p_method:method,
        p_reference:reference.trim()||null,
        p_shift_id:shiftId||null,
        p_client_request_id:requestId.current,
      });
      if(error)throw error;
      setMessage(`Supplier payment recorded • ${data}`);
      requestId.current=crypto.randomUUID();
      setAmount(0);setReference("");
      router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not record supplier payment.");}
    finally{setBusy(false);}
  }

  return <>
    <div className="pagehead">
      <div><h1>Supplier Accounts</h1><p>Supplier purchases, payments, outstanding balances and account statements.</p></div>
      <a className="btn secondary" href="/purchase-orders">Purchase Orders</a>
    </div>

    {message&&<div className="hero" style={{padding:14}}><b>{message}</b></div>}

    <div className="grid4">
      <div className="card stat"><div className="label">Total Purchases</div><div className="value">{ugx(totalPurchases)}</div></div>
      <div className="card stat"><div className="label">Total Paid</div><div className="value">{ugx(totalPaid)}</div></div>
      <div className="card stat"><div className="label">Total Outstanding</div><div className="value">{ugx(totalBalance)}</div></div>
      <div className="card stat"><div className="label">Overdue</div><div className="value">{ugx(overdue)}</div></div>
    </div>

    <div className="tablewrap" style={{marginTop:16}}><table>
      <thead><tr><th>Supplier</th><th>Purchases</th><th>Paid</th><th>Outstanding</th><th>Overdue</th><th>Next Due</th><th>Open</th></tr></thead>
      <tbody>{accounts.length===0?<tr><td colSpan={7}>No supplier accounts found.</td></tr>:accounts.map(a=><tr key={a.supplier_id}>
        <td><b>{a.supplier_name}</b></td>
        <td>{ugx(Number(a.total_purchases||0))}</td>
        <td>{ugx(Number(a.total_paid||0))}</td>
        <td><b>{ugx(Number(a.outstanding_balance||0))}</b></td>
        <td>{Number(a.overdue_balance)>0?<span className="badge red">{ugx(Number(a.overdue_balance))}</span>:<span className="badge green">None</span>}</td>
        <td>{a.next_due_date??"—"}</td>
        <td><button className="btn secondary" onClick={()=>chooseSupplier(a.supplier_id)}>Open</button></td>
      </tr>)}</tbody>
    </table></div>

    {current&&<div className="card" style={{marginTop:16}}>
      <div className="pagehead" style={{marginBottom:10}}>
        <div><h2 style={{margin:0,color:"var(--brown)"}}>{current.supplier_name}</h2><p style={{marginTop:5}}>Selected supplier account</p></div>
      </div>
      <div className="grid4">
        <div className="card stat"><div className="label">Purchases</div><div className="value">{ugx(Number(current.total_purchases||0))}</div></div>
        <div className="card stat"><div className="label">Paid</div><div className="value">{ugx(Number(current.total_paid||0))}</div></div>
        <div className="card stat"><div className="label">Amount Owed</div><div className="value">{ugx(Number(current.outstanding_balance||0))}</div></div>
        <div className="card stat"><div className="label">Overdue</div><div className="value">{ugx(Number(current.overdue_balance||0))}</div></div>
      </div>
    </div>}

    <div className="card" style={{marginTop:16}}>
      <h2 style={{color:"var(--brown)",marginTop:0}}>Open Payables</h2>
      <div className="tablewrap"><table>
        <thead><tr><th>Purchase</th><th>Supplier</th><th>Total</th><th>Paid</th><th>Owed</th><th>Status</th><th>Due Date</th></tr></thead>
        <tbody>{payables.length===0?<tr><td colSpan={7}>No supplier balances are currently outstanding.</td></tr>:payables.map((p:any)=><tr key={p.id}>
          <td><b>{p.purchase_no}</b></td><td>{p.supplier_name}</td>
          <td>{ugx(Number(p.total_amount||0))}</td><td>{ugx(Number(p.amount_paid||0))}</td><td><b>{ugx(Number(p.outstanding_amount||0))}</b></td>
          <td><span className={p.payment_status==="partial"?"badge gold":"badge red"}>{String(p.payment_status??"").toUpperCase()}</span></td>
          <td>{p.due_date??"—"}</td>
        </tr>)}</tbody>
      </table></div>
    </div>

    <div className="grid2" style={{marginTop:16}}>
      <div className="card">
        <h3 style={{color:"var(--brown)",marginTop:0}}>{current?.supplier_name??"Supplier"} — Statement</h3>
        <div className="tablewrap"><table style={{minWidth:650}}>
          <thead><tr><th>Date</th><th>Reference</th><th>Debit</th><th>Credit</th><th>Balance</th><th>Status</th></tr></thead>
          <tbody>{supplierStatement.length===0?<tr><td colSpan={6}>No statement lines.</td></tr>:supplierStatement.map((s:any)=><tr key={`${s.line_type}-${s.source_id}`}>
            <td>{new Date(s.occurred_at).toLocaleDateString()}</td>
            <td>{s.reference}{s.supplier_invoice_no&&<><br/><span style={{fontSize:11,color:"var(--muted)"}}>{s.supplier_invoice_no}</span></>}</td>
            <td>{Number(s.debit)>0?ugx(Number(s.debit)):"—"}</td>
            <td>{Number(s.credit)>0?ugx(Number(s.credit)):s.voided_at&&Number(s.original_amount)>0?<span style={{textDecoration:"line-through"}}>{ugx(Number(s.original_amount))}</span>:"—"}</td>
            <td><b>{ugx(Number(s.running_balance||0))}</b></td>
            <td>{s.voided_at?<span className="badge red">VOIDED</span>:s.edited_at?<span className="badge gold">EDITED</span>:<span className="badge green">ACTIVE</span>}</td>
          </tr>)}</tbody>
        </table></div>
      </div>

      <div className="card">
        <h3 style={{color:"var(--brown)",marginTop:0}}>Record Supplier Payment</h3>
        <div className="field"><label>Supplier</label><select value={supplierId} onChange={e=>chooseSupplier(e.target.value)}>{accounts.map(a=><option key={a.supplier_id} value={a.supplier_id}>{a.supplier_name}</option>)}</select></div>
        <div className="field"><label>Outstanding purchase</label><select value={purchaseId} onChange={e=>setPurchaseId(e.target.value)}>
          <option value="">Select purchase</option>
          {payables.filter(p=>p.supplier_id===supplierId).map(p=><option key={p.id} value={p.id}>{p.purchase_no} • owed {ugx(Number(p.outstanding_amount))}</option>)}
        </select></div>
        {currentPurchase&&<div className="hero" style={{padding:12,marginBottom:12}}>
          <b>{currentPurchase.purchase_no}</b><br/>
          Total {ugx(Number(currentPurchase.total_amount||0))} • Paid {ugx(Number(currentPurchase.amount_paid||0))} • Owed {ugx(Number(currentPurchase.outstanding_amount||0))}
        </div>}
        <div className="field"><label>Amount</label><input type="number" min="0.01" value={amount} onChange={e=>setAmount(Number(e.target.value))}/></div>
        <div className="field"><label>Method</label><select value={method} onChange={e=>setMethod(e.target.value)}><option value="bank">Bank</option><option value="cash">Cash</option><option value="mtn_momo">MTN MoMo</option><option value="airtel_money">Airtel Money</option></select></div>
        {method!=="cash"&&<div className="field"><label>Reference</label><input value={reference} onChange={e=>setReference(e.target.value)}/></div>}
        {method==="cash"&&<div className="field"><label>Cashier shift (optional if paid from general cash)</label><select value={shiftId} onChange={e=>setShiftId(e.target.value)}><option value="">General business cash</option>{shifts.map(s=><option key={s.id} value={s.id}>{s.cashier_name} • open shift</option>)}</select></div>}
        <button className="btn primary" style={{width:"100%"}} disabled={busy} onClick={pay}>{busy?"Working…":"Record Payment"}</button>
      </div>
    </div>
  </>;
}
