'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ugx } from "@/lib/costing";

export default function SupplierAccountsPanel({
  accounts,statements,payables,shifts,live,operationsAllowed=true,operationsReason="Business operations are enabled"
}:{
  accounts:any[];statements:any[];payables:any[];shifts:any[];live:boolean;
  operationsAllowed?:boolean;operationsReason?:string;
}){
  const router=useRouter();
  const [supplierId,setSupplierId]=useState(accounts[0]?.supplier_id??"");
  const [purchaseId,setPurchaseId]=useState(payables.find((p:any)=>p.supplier_id===accounts[0]?.supplier_id)?.id??"");
  const [amount,setAmount]=useState(0);
  const [method,setMethod]=useState("bank");
  const [reference,setReference]=useState("");
  const [shiftId,setShiftId]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const requestId=useRef(crypto.randomUUID());

  const current=accounts.find((a:any)=>a.supplier_id===supplierId);
  const currentPurchase=payables.find((p:any)=>p.id===purchaseId&&p.supplier_id===supplierId);
  const supplierPayables=payables.filter((p:any)=>p.supplier_id===supplierId);
  const supplierStatement=statements.filter((s:any)=>s.supplier_id===supplierId).slice(0,50);
  const totalBalance=useMemo(()=>accounts.reduce((s:number,a:any)=>s+Number(a.outstanding_balance||0),0),[accounts]);
  const overdue=useMemo(()=>accounts.reduce((s:number,a:any)=>s+Number(a.overdue_balance||0),0),[accounts]);

  useEffect(()=>{
    if(!payables.some((p:any)=>p.id===purchaseId&&p.supplier_id===supplierId)){
      setPurchaseId(payables.find((p:any)=>p.supplier_id===supplierId)?.id??"");
      setAmount(0);
    }
  },[payables,purchaseId,supplierId]);

  function chooseSupplier(id:string){
    setSupplierId(id);
    const next=payables.find((p:any)=>p.supplier_id===id);
    setPurchaseId(next?.id??"");
    setAmount(0);
  }

  async function pay(){
    if(!operationsAllowed){setMessage(operationsReason);return;}
    if(!currentPurchase){setMessage("Select an outstanding purchase for this supplier.");return;}
    if(!Number.isFinite(amount)||amount<=0){setMessage("Payment amount must be greater than zero.");return;}
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
        p_shift_id:method==="cash"?(shiftId||null):null,
        p_client_request_id:requestId.current,
      });
      if(error)throw error;
      setMessage(`Supplier payment recorded: ${data}`);
      requestId.current=crypto.randomUUID();
      setAmount(0);setReference("");
      router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not record supplier payment.");}
    finally{setBusy(false);}
  }

  return <>
    <div className="pagehead">
      <div><h1>Supplier Accounts</h1><p>Supplier balances, open payables, statement history and payment allocation.</p></div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <a className="btn secondary" href="/purchase-orders">Purchase Orders</a>
        <a className="btn secondary" href="/purchases">Purchase Receiving</a>
        <span className="badge green">Accounts Payable</span>
      </div>
    </div>

    {!operationsAllowed&&<div className="hero" style={{padding:14}}><b>Live operations are locked.</b><div style={{marginTop:4}}>{operationsReason}</div></div>}
    {message&&<div className="hero" style={{padding:14}}><b>{message}</b></div>}

    <div className="grid4">
      <div className="card stat"><div className="label">Total Outstanding</div><div className="value">{ugx(totalBalance)}</div></div>
      <div className="card stat"><div className="label">Overdue</div><div className="value">{ugx(overdue)}</div></div>
      <div className="card stat"><div className="label">Supplier Accounts</div><div className="value">{accounts.length}</div></div>
      <div className="card stat"><div className="label">Open Payables</div><div className="value">{payables.length}</div></div>
    </div>

    <div className="tablewrap" style={{marginTop:16}}><table>
      <thead><tr><th>Supplier</th><th>Total Purchases</th><th>Paid</th><th>Outstanding</th><th>Overdue</th><th>Next Due</th><th>Open</th></tr></thead>
      <tbody>{accounts.length===0?<tr><td colSpan={7}>No supplier accounts found.</td></tr>:accounts.map((a:any)=><tr key={a.supplier_id}>
        <td><b>{a.supplier_name}</b></td>
        <td>{ugx(Number(a.total_purchases||0))}</td>
        <td>{ugx(Number(a.total_paid||0))}</td>
        <td><b>{ugx(Number(a.outstanding_balance||0))}</b></td>
        <td>{Number(a.overdue_balance||0)>0?<span className="badge red">{ugx(Number(a.overdue_balance))}</span>:<span className="badge green">None</span>}</td>
        <td>{a.next_due_date??"—"}</td>
        <td><button className="btn secondary" onClick={()=>chooseSupplier(a.supplier_id)}>Open</button></td>
      </tr>)}</tbody>
    </table></div>

    {current&&<div className="grid4" style={{marginTop:16}}>
      <div className="card stat"><div className="label">Selected Supplier</div><div className="value" style={{fontSize:18}}>{current.supplier_name}</div></div>
      <div className="card stat"><div className="label">Purchases</div><div className="value">{ugx(Number(current.total_purchases||0))}</div></div>
      <div className="card stat"><div className="label">Paid</div><div className="value">{ugx(Number(current.total_paid||0))}</div></div>
      <div className="card stat"><div className="label">Balance Owed</div><div className="value">{ugx(Number(current.outstanding_balance||0))}</div></div>
    </div>}

    <div className="grid2" style={{marginTop:16}}>
      <div className="card">
        <h3 style={{color:"var(--brown)",marginTop:0}}>Open Purchases — {current?.supplier_name??"Supplier"}</h3>
        <div className="tablewrap"><table style={{minWidth:0}}>
          <thead><tr><th>PO</th><th>Total</th><th>Paid</th><th>Outstanding</th><th>Due</th><th>Status</th></tr></thead>
          <tbody>{supplierPayables.length===0?<tr><td colSpan={6}>No open payables for this supplier.</td></tr>:supplierPayables.map((p:any)=><tr key={p.id}>
            <td><b>{p.purchase_no}</b></td>
            <td>{ugx(Number(p.total_amount||0))}</td>
            <td>{ugx(Number(p.amount_paid||0))}</td>
            <td><b>{ugx(Number(p.outstanding_amount||0))}</b></td>
            <td>{p.due_date??"—"}</td>
            <td><span className={p.payment_status==="paid"?"badge green":"badge gold"}>{String(p.payment_status??"").toUpperCase()}</span></td>
          </tr>)}</tbody>
        </table></div>
      </div>

      <div className="card">
        <h3 style={{color:"var(--brown)",marginTop:0}}>Record Supplier Payment</h3>
        <div className="field"><label>Supplier</label><select value={supplierId} onChange={e=>chooseSupplier(e.target.value)}>{accounts.map((a:any)=><option key={a.supplier_id} value={a.supplier_id}>{a.supplier_name}</option>)}</select></div>
        <div className="field"><label>Outstanding purchase</label><select value={purchaseId} onChange={e=>setPurchaseId(e.target.value)}><option value="">Select purchase</option>{supplierPayables.map((p:any)=><option key={p.id} value={p.id}>{p.purchase_no} — {ugx(Number(p.outstanding_amount||0))}</option>)}</select></div>
        {currentPurchase&&<div className="hero" style={{padding:12}}>
          <b>{currentPurchase.purchase_no}</b><br/>
          Total {ugx(Number(currentPurchase.total_amount||0))} • Paid {ugx(Number(currentPurchase.amount_paid||0))} • Outstanding {ugx(Number(currentPurchase.outstanding_amount||0))}
        </div>}
        <div className="field"><label>Amount</label><input type="number" min="0.01" value={amount} onChange={e=>setAmount(Number(e.target.value))}/></div>
        <div className="field"><label>Method</label><select value={method} onChange={e=>setMethod(e.target.value)}><option value="bank">Bank</option><option value="cash">Cash</option><option value="mtn_momo">MTN MoMo</option><option value="airtel_money">Airtel Money</option></select></div>
        {method!=="cash"&&<div className="field"><label>Reference</label><input value={reference} onChange={e=>setReference(e.target.value)}/></div>}
        {method==="cash"&&<div className="field"><label>Cashier shift (optional)</label><select value={shiftId} onChange={e=>setShiftId(e.target.value)}><option value="">General business cash</option>{shifts.map((s:any)=><option key={s.id} value={s.id}>{s.cashier_name} — open shift</option>)}</select></div>}
        <button className="btn primary" style={{width:"100%"}} disabled={busy||!operationsAllowed} onClick={pay}>{busy?"Working...":"Record Payment"}</button>
      </div>
    </div>

    <div className="card" style={{marginTop:16}}>
      <h3 style={{color:"var(--brown)",marginTop:0}}>{current?.supplier_name??"Supplier"} — Statement</h3>
      <p style={{color:"var(--muted)"}}>Latest {supplierStatement.length} statement lines, newest first. Each balance includes earlier transactions for this supplier.</p>
      <div className="tablewrap"><table>
        <thead><tr><th>Date</th><th>Reference</th><th>Debit</th><th>Credit</th><th>Balance</th><th>Status</th></tr></thead>
        <tbody>{supplierStatement.length===0?<tr><td colSpan={6}>No statement lines.</td></tr>:supplierStatement.map((s:any)=><tr key={`${s.line_type}-${s.source_id}`}>
          <td>{new Date(s.occurred_at).toLocaleDateString()}</td>
          <td>{s.reference}{s.supplier_invoice_no&&<><br/><span style={{fontSize:12,color:"var(--muted)"}}>Invoice: {s.supplier_invoice_no}</span></>}</td>
          <td>{Number(s.debit||0)>0?ugx(Number(s.debit)):"—"}</td>
          <td>{s.voided_at?<><b>{ugx(0)}</b><br/><span style={{fontSize:12,color:"var(--muted)"}}>Original: {ugx(Number(s.original_amount??0))}</span></>:Number(s.credit||0)>0?ugx(Number(s.credit)):"—"}</td>
          <td><b>{ugx(Number(s.running_balance||0))}</b></td>
          <td>{s.voided_at?<span className="badge red">VOIDED</span>:s.edited_at?<span className="badge gold">EDITED</span>:<span className="badge green">ACTIVE</span>}</td>
        </tr>)}</tbody>
      </table></div>
    </div>
  </>;
}
