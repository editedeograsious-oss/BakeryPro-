'use client';

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ugx } from "@/lib/costing";
import ExpenseCorrectionActions from "@/components/finance/ExpenseCorrectionActions";

export default function ExpenseManager({
  expenses,shifts,live,canCorrect,operationsAllowed=false,operationsReason="Business operations are locked.",businessDate
}:{expenses:any[];shifts:any[];live:boolean;canCorrect:boolean;operationsAllowed?:boolean;operationsReason?:string;businessDate?:string}){
  const router=useRouter();
  const [category,setCategory]=useState("");
  const [description,setDescription]=useState("");
  const [amount,setAmount]=useState(0);
  const [method,setMethod]=useState("cash");
  const [reference,setReference]=useState("");
  const [shiftId,setShiftId]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const requestId=useRef(crypto.randomUUID());
  const inFlight=useRef(false);

  const today=businessDate??new Intl.DateTimeFormat("sv-SE",{timeZone:"Africa/Kampala"}).format(new Date());
  const activeExpenses=useMemo(()=>expenses.filter(e=>!e.voided_at),[expenses]);
  const todayTotal=useMemo(()=>activeExpenses.filter(e=>String(e.business_date??e.created_at).slice(0,10)===today).reduce((s,e)=>s+Number(e.amount||0),0),[activeExpenses,today]);
  const cashTotal=activeExpenses.filter(e=>e.payment_method==="cash").reduce((s,e)=>s+Number(e.amount||0),0);
  const momoTotal=activeExpenses.filter(e=>["mtn_momo","airtel_money"].includes(e.payment_method)).reduce((s,e)=>s+Number(e.amount||0),0);
  const bankTotal=activeExpenses.filter(e=>e.payment_method==="bank").reduce((s,e)=>s+Number(e.amount||0),0);

  async function save(){
    if(!live){setMessage("Expense changes require a connected database.");return;}
    if(!operationsAllowed){setMessage(operationsReason);return;}
    if(inFlight.current)return;
    if(category.trim().toLowerCase()==="payroll"){setMessage("Record salary payments from Staff Salaries & Payroll.");return;}
    if(!category.trim()||!description.trim()||!Number.isFinite(amount)||amount<=0){setMessage("Category, description and a valid positive amount are required.");return;}
    if(method!=="cash"&&!reference.trim()){setMessage("Enter a transaction reference.");return;}
    inFlight.current=true;
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {data,error}=await supabase.rpc("record_business_expense",{
        p_category:category.trim(),
        p_description:description.trim(),
        p_amount:amount,
        p_payment_method:method,
        p_reference:reference.trim()||null,
        p_shift_id:shiftId||null,
        p_client_request_id:requestId.current,
      });
      if(error)throw error;
      setMessage(`Expense recorded • ${data}`);
      requestId.current=crypto.randomUUID();
      setCategory("");setDescription("");setAmount(0);setReference("");
      router.refresh();
    }catch(e){setMessage(e&&typeof e==="object"&&"message" in e?String(e.message):"Could not record expense.");}
    finally{inFlight.current=false;setBusy(false);}
  }

  return <>
    <div className="pagehead">
      <div><h1>Expenses</h1><p>Business expenses feeding daily closing and owner reports.</p></div>
      {canCorrect&&<span className="badge gold">Corrections Enabled</span>}
    </div>
    {message&&<div className="hero" style={{padding:14}}><b>{message}</b></div>}
    {live&&!operationsAllowed&&<div className="hero" style={{padding:14}}><b>Expense transactions locked</b><p>{operationsReason}</p></div>}

    <div className="grid4">
      <div className="card stat"><div className="label">Today</div><div className="value">{ugx(todayTotal)}</div></div>
      <div className="card stat"><div className="label">Cash Expenses</div><div className="value">{ugx(cashTotal)}</div></div>
      <div className="card stat"><div className="label">MoMo Expenses</div><div className="value">{ugx(momoTotal)}</div></div>
      <div className="card stat"><div className="label">Bank Expenses</div><div className="value">{ugx(bankTotal)}</div></div>
    </div>
    <p style={{color:"var(--muted)",fontSize:12}}>Payment totals cover {expenses.length} loaded records. Voided expenses contribute UGX 0.</p>

    <div className="card" style={{marginTop:16}}>
      <h3 style={{color:"var(--brown)",marginTop:0}}>Record Expense</h3>
      <div className="grid2">
        <div className="field"><label>Category</label><input value={category} onChange={e=>setCategory(e.target.value)} placeholder="Transport / Utilities / Packaging"/></div>
        <div className="field"><label>Description</label><input value={description} onChange={e=>setDescription(e.target.value)}/></div>
      </div>
      <div className="grid2">
        <div className="field"><label>Amount</label><input type="number" min="0.01" value={amount} onChange={e=>setAmount(Number(e.target.value))}/></div>
        <div className="field"><label>Payment method</label><select value={method} onChange={e=>setMethod(e.target.value)}><option value="cash">Cash</option><option value="mtn_momo">MTN MoMo</option><option value="airtel_money">Airtel Money</option><option value="bank">Bank</option></select></div>
      </div>
      {method!=="cash"
        ?<div className="field"><label>Transaction reference</label><input value={reference} onChange={e=>setReference(e.target.value)}/></div>
        :<div className="field"><label>Cashier shift (optional)</label><select value={shiftId} onChange={e=>setShiftId(e.target.value)}><option value="">General business cash</option>{shifts.map(s=><option key={s.id} value={s.id}>{s.cashier_name}</option>)}</select></div>}
      <button className="btn primary" disabled={busy||!live||!operationsAllowed} onClick={save}>{busy?"Working…":"Record Expense"}</button>
    </div>

    <div className="hero" style={{marginTop:16}}>
      <h2>Made a mistake?</h2>
      <p>Use <b>Edit</b> to correct the record or <b>Delete / Void</b> to remove it from totals. Voided expenses can be restored and every correction is audited.</p>
    </div>

    <div className="tablewrap" style={{marginTop:16}}>
      <table>
        <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Method</th><th>Reference</th><th>Recorded By</th><th>Shift</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>{expenses.length===0?<tr><td colSpan={10}>No expenses found.</td></tr>:expenses.map(e=><tr key={e.id} style={e.voided_at?{opacity:.65}:{}}>
          <td>{new Date(e.created_at).toLocaleString()}</td>
          <td>{e.category}</td>
          <td>{e.description}{e.edited_at&&<div style={{fontSize:11,color:"var(--muted)"}}>Edited: {e.edit_reason??"correction"}</div>}{e.voided_at&&<div style={{fontSize:11,color:"var(--muted)"}}>Void: {e.void_reason??"—"}</div>}</td>
          <td><b>{ugx(e.voided_at?0:Number(e.amount))}</b>{e.voided_at&&<><br/><small>Original: {ugx(Number(e.amount))}</small></>}</td>
          <td>{e.payment_method}</td>
          <td>{e.reference??"—"}</td>
          <td>{e.recorded_by_name??"—"}</td>
          <td>{e.shift_label??"—"}</td>
          <td>{e.voided_at?<span className="badge red">VOIDED</span>:e.edited_at?<span className="badge gold">EDITED</span>:<span className="badge green">ACTIVE</span>}</td>
          <td><ExpenseCorrectionActions row={e} live={live} canCorrect={canCorrect} operationsAllowed={operationsAllowed} operationsReason={operationsReason} onMessage={setMessage} onDone={()=>router.refresh()}/></td>
        </tr>)}</tbody>
      </table>
    </div>
  </>;
}
