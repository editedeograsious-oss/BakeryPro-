"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ugx } from "@/lib/costing";

export default function CreditBookManager({accounts,ledger,live,canSetTerms,canPostTransactions=true}:{accounts:any[];ledger:any[];live:boolean;canSetTerms:boolean;canPostTransactions?:boolean}){
  const router=useRouter();
  const [selectedId,setSelectedId]=useState(accounts[0]?.customer_id??"");
  const selected=accounts.find(a=>a.customer_id===selectedId);
  const [enabled,setEnabled]=useState(Boolean(selected?.credit_enabled));
  const [limit,setLimit]=useState(Number(selected?.credit_limit??0));
  const [terms,setTerms]=useState(Number(selected?.terms_days??7));
  const [notes,setNotes]=useState(selected?.notes??"");
  const [payAmount,setPayAmount]=useState(0);const [method,setMethod]=useState("cash");const [reference,setReference]=useState("");
  const [message,setMessage]=useState("");const [busy,setBusy]=useState(false);const req=useRef(crypto.randomUUID());

  const totalOutstanding=useMemo(()=>accounts.reduce((s,a)=>s+Math.max(Number(a.balance_due||0),0),0),[accounts]);
  const overdue=useMemo(()=>accounts.filter(a=>a.oldest_overdue_date&&Number(a.balance_due)>0),[accounts]);
  const totalOverdue=useMemo(()=>accounts.reduce((s,a)=>s+Math.max(Number(a.overdue_net||0),0),0),[accounts]);
  function choose(id:string){setSelectedId(id);const a=accounts.find(x=>x.customer_id===id);setEnabled(Boolean(a?.credit_enabled));setLimit(Number(a?.credit_limit??0));setTerms(Number(a?.terms_days??7));setNotes(a?.notes??"");setPayAmount(0);setReference("");}

  async function saveTerms(){
    if(!selected)return;if(limit<0||terms<0){setMessage("Credit limit and terms must be valid.");return;}if(!live){setMessage("Demo mode: credit terms simulated.");return;}
    setBusy(true);setMessage("");try{const supabase=createClient();const {error}=await supabase.rpc("save_customer_credit_terms",{p_customer_id:selected.customer_id,p_enabled:enabled,p_credit_limit:limit,p_terms_days:terms,p_notes:notes.trim()||null});if(error)throw error;setMessage("Customer credit terms updated.");router.refresh();}catch(e){setMessage(e instanceof Error?e.message:"Could not save credit terms.");}finally{setBusy(false);}
  }
  async function recordPayment(){
    if(!canPostTransactions){setMessage("Credit repayments are locked while live operations are off.");return;}
    if(!selected||payAmount<=0){setMessage("Select a customer and enter a payment amount.");return;}if(payAmount>Number(selected.balance_due||0)){setMessage("Payment cannot exceed the outstanding credit balance.");return;}if(method!=="cash"&&!reference.trim()){setMessage("Reference is required for non-cash payment.");return;}if(!live){setMessage("Demo mode: credit payment simulated.");return;}
    setBusy(true);setMessage("");try{const supabase=createClient();const {error}=await supabase.rpc("record_credit_payment",{p_customer_id:selected.customer_id,p_amount:payAmount,p_method:method,p_reference:reference.trim()||null,p_notes:"Credit book repayment",p_client_request_id:req.current});if(error)throw error;req.current=crypto.randomUUID();setPayAmount(0);setReference("");setMessage("Credit payment recorded and included in daily cash controls.");router.refresh();}catch(e){setMessage(e instanceof Error?e.message:"Could not record payment.");}finally{setBusy(false);}
  }

  async function adjustCreditSale(row:any){
    if(!canSetTerms||!canPostTransactions||!row.sale_id||row.entry_type!=="charge"||Number(row.charge_outstanding||0)<=0)return;
    const raw=window.prompt(`Reduce the unpaid balance for ${row.sale_no??"this credit sale"}. Maximum ${ugx(Number(row.charge_outstanding||0))}. Enter amount:`);
    if(raw==null)return;
    const amount=Number(raw);
    if(!Number.isFinite(amount)||amount<=0||amount>Number(row.charge_outstanding||0)){setMessage("Enter a valid amount not greater than the unpaid sale balance.");return;}
    const reason=window.prompt("Reason for reducing this unpaid credit sale (required):");
    if(!reason?.trim())return;
    if(!window.confirm(`Reduce unpaid credit by ${ugx(amount)}? This creates an audited credit adjustment; it does not erase the sale.`))return;
    if(!live){setMessage("Demo mode: credit adjustment simulated.");return;}
    setBusy(true);setMessage("");
    try{const supabase=createClient();const {error}=await supabase.rpc("adjust_unpaid_credit_sale",{p_sale_id:row.sale_id,p_amount:amount,p_reason:reason.trim()});if(error)throw error;setMessage("Unpaid credit reduced with an audited adjustment.");router.refresh();}
    catch(e){setMessage(e instanceof Error?e.message:"Could not adjust the credit sale.");}
    finally{setBusy(false);}
  }

  return <>
    <div className="pagehead"><div><h1>Customer Credit Book</h1><p>Control approved credit limits, credit sales, repayments and overdue balances.</p></div><div className="action-row"><a className="btn secondary" href="/customers">Add Customers</a>{canSetTerms&&<a className="btn secondary" href="/opening-balances">Opening Customer Debts</a>}<a className="btn primary" href="/pos">Open POS</a></div></div>
    {!canPostTransactions&&<div className="hero" style={{padding:14,marginBottom:16}}>Live repayments and credit corrections are locked. Customer profiles and credit terms can be prepared; existing debts belong in Opening Customer Debts.</div>}
    {message&&<div className="hero" style={{padding:14}}><b>{message}</b></div>}
    <div className="grid4"><div className="card stat"><div className="label">Outstanding Credit</div><div className="value">{ugx(totalOutstanding)}</div></div><div className="card stat"><div className="label">Overdue Amount</div><div className="value">{ugx(totalOverdue)}</div></div><div className="card stat"><div className="label">Credit Customers</div><div className="value">{accounts.filter(a=>a.credit_enabled).length}</div></div><div className="card stat"><div className="label">Overdue Accounts</div><div className="value">{overdue.length}</div></div></div>
    <div className="grid2" style={{marginTop:16}}>
      <div className="card"><h3 style={{color:"var(--brown)",marginTop:0}}>Customer Credit Account</h3><div className="field"><label>Customer</label><select value={selectedId} onChange={e=>choose(e.target.value)}><option value="">Select customer</option>{accounts.map(a=><option key={a.customer_id} value={a.customer_id}>{a.full_name} • {ugx(Number(a.balance_due||0))} due</option>)}</select></div>
        {selected&&<><p><b>{selected.full_name}</b> {selected.phone?`• ${selected.phone}`:""}</p><p>Outstanding: <b>{ugx(Number(selected.balance_due||0))}</b> • Available credit: <b>{ugx(Number(selected.available_credit||0))}</b></p>
        {canSetTerms&&<><label style={{display:"flex",gap:8,alignItems:"center",marginBottom:12}}><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> Credit enabled</label><div className="grid2"><div className="field"><label>Credit limit (UGX)</label><input type="number" min="0" value={limit} onChange={e=>setLimit(Number(e.target.value))}/></div><div className="field"><label>Terms (days)</label><input type="number" min="0" max="365" value={terms} onChange={e=>setTerms(Number(e.target.value))}/></div></div><div className="field"><label>Notes</label><input value={notes} onChange={e=>setNotes(e.target.value)}/></div><button className="btn secondary" disabled={busy} onClick={saveTerms}>Save Credit Terms</button></>}</>}
      </div>
      <div className="card"><h3 style={{color:"var(--brown)",marginTop:0}}>Record Repayment</h3>{selected?<><div className="field"><label>Amount</label><input type="number" min="0" value={payAmount} onChange={e=>setPayAmount(Number(e.target.value))}/></div><div className="field"><label>Method</label><select value={method} onChange={e=>setMethod(e.target.value)}><option value="cash">Cash</option><option value="mtn_momo">MTN MoMo</option><option value="airtel_money">Airtel Money</option><option value="bank">Bank</option></select></div>{method!=="cash"&&<div className="field"><label>Transaction reference</label><input value={reference} onChange={e=>setReference(e.target.value)}/></div>}<button className="btn primary" disabled={busy||!canPostTransactions||Number(selected.balance_due)<=0} onClick={recordPayment}>Record Credit Payment</button></>:<p style={{color:"var(--muted)"}}>Select a customer first.</p>}</div>
    </div>
    <div className="tablewrap" style={{marginTop:16}}><table><thead><tr><th>Customer</th><th>Credit</th><th>Limit</th><th>Balance Due</th><th>Available</th><th>Terms</th><th>Overdue</th></tr></thead><tbody>{accounts.map(a=><tr key={a.customer_id}><td><b>{a.full_name}</b><br/><small>{a.phone??""}</small></td><td><span className={a.credit_enabled?"badge green":"badge gold"}>{a.credit_enabled?"Enabled":"Disabled"}</span></td><td>{ugx(Number(a.credit_limit||0))}</td><td><b>{ugx(Number(a.balance_due||0))}</b></td><td>{ugx(Number(a.available_credit||0))}</td><td>{a.terms_days} days</td><td>{a.oldest_overdue_date?<><span className="badge red">Since {a.oldest_overdue_date}</span><br/><small>{ugx(Number(a.overdue_net||0))} overdue</small></>:<span className="badge green">Current</span>}</td></tr>)}</tbody></table></div>
    <div className="tablewrap" style={{marginTop:16}}><table><thead><tr><th>Date</th><th>Customer</th><th>Type</th><th>Sale</th><th>Amount</th><th>Unpaid on Sale</th><th>Method</th><th>Due Date</th><th>Running Balance</th><th>Status</th><th>Action</th></tr></thead><tbody>{ledger.length===0?<tr><td colSpan={11}>No credit ledger entries.</td></tr>:ledger.map(l=>{const shownDelta=l.reversed_at?Number(l.reversed_original_amount_delta||0):Number(l.amount_delta||0);return <tr key={l.id}><td>{new Date(l.created_at).toLocaleString()}</td><td>{l.customer_name}</td><td><span className={l.entry_type==="payment"?"badge green":l.entry_type==="adjustment"?"badge red":"badge gold"}>{l.entry_type}</span></td><td>{l.sale_no??"—"}</td><td>{shownDelta<0?`- ${ugx(Math.abs(shownDelta))}`:ugx(shownDelta)}</td><td>{l.entry_type==="charge"?ugx(Number(l.charge_outstanding||0)):"—"}</td><td>{l.payment_method??"—"}</td><td>{l.due_date??"—"}</td><td><b>{ugx(Number(l.running_balance||0))}</b></td><td>{l.reversed_at?<span className="badge red">REVERSED</span>:<span className="badge green">ACTIVE</span>}</td><td>{canSetTerms&&canPostTransactions&&l.sale_id&&l.entry_type==="charge"&&Number(l.charge_outstanding||0)>0?<button className="btn secondary" disabled={busy} onClick={()=>adjustCreditSale(l)}>Adjust Unpaid</button>:"—"}</td></tr>})}</tbody></table></div>
  </>;
}
