'use client';
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ugx } from "@/lib/costing";

export default function FinanceControlPanel({accounts,reconciliations,live}:{accounts:any[];reconciliations:any[];live:boolean}){
  const router=useRouter();
  const [from,setFrom]=useState(accounts[0]?.id??"");
  const [to,setTo]=useState(accounts[1]?.id??"");
  const [amount,setAmount]=useState(0);
  const [actual,setActual]=useState(0);
  const [reconcileAccount,setReconcileAccount]=useState(accounts[0]?.id??"");
  const [reason,setReason]=useState("");
  const [reference,setReference]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const total=accounts.reduce((s,a)=>s+Number(a.balance||0),0);

  async function transfer(){
    if(amount<=0||!from||!to||from===to){setMessage("Choose two different accounts and enter a positive amount.");return;}
    if(!live){setMessage("Demo mode: transfer simulated.");return;}
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {error}=await supabase.rpc("transfer_money",{p_from_account:from,p_to_account:to,p_amount:amount,p_reference:reference.trim()||null,p_notes:reason.trim()||null});
      if(error)throw error;
      setMessage("Transfer recorded. It moved money between accounts and did not count as income or expense.");
      setAmount(0);setReference("");setReason("");router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not record transfer.");}
    finally{setBusy(false);}
  }

  async function reconcile(){
    if(!reconcileAccount||actual<0){setMessage("Choose an account and enter the actual balance.");return;}
    if(!live){setMessage("Demo mode: reconciliation simulated.");return;}
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {error}=await supabase.rpc("reconcile_money_account",{p_account_id:reconcileAccount,p_actual_balance:actual,p_reason:reason.trim()||null});
      if(error)throw error;
      setMessage("Account reconciled.");router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not reconcile account.");}
    finally{setBusy(false);}
  }

  return <>
    <div className="pagehead"><div><h1>Finance & Reconciliation</h1><p>Track where money is held without confusing transfers with profit.</p></div><span className="badge green">TOTAL {ugx(total)}</span></div>
    {message&&<div className="hero" style={{padding:14}}><b>{message}</b></div>}
    <div className="grid4">{accounts.length===0?<div className="card">No active money accounts found.</div>:accounts.map(a=><div className="card stat" key={a.id}><div className="label">{a.name}</div><div className="value" style={{fontSize:22}}>{ugx(Number(a.balance||0))}</div><small>{String(a.account_type).replaceAll("_"," ")}</small></div>)}</div>
    <div className="grid2" style={{marginTop:16}}>
      <div className="card"><h3>Internal Transfer</h3><p style={{color:"var(--muted)"}}>Transfers move money between accounts and do not count as sales or expenses.</p>
        <div className="field"><label>From</label><select value={from} onChange={e=>setFrom(e.target.value)}>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
        <div className="field"><label>To</label><select value={to} onChange={e=>setTo(e.target.value)}>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
        <div className="field"><label>Amount (UGX)</label><input type="number" min="0.01" value={amount} onChange={e=>setAmount(Number(e.target.value))}/></div>
        <div className="field"><label>Reference (optional)</label><input value={reference} onChange={e=>setReference(e.target.value)}/></div>
        <div className="field"><label>Note (optional)</label><input value={reason} onChange={e=>setReason(e.target.value)}/></div>
        <button className="btn primary" disabled={busy||accounts.length<2} onClick={transfer}>Record Transfer</button>
      </div>
      <div className="card"><h3>Reconcile Account</h3><p style={{color:"var(--muted)"}}>Compare the system balance with the real cash/MoMo/bank balance.</p>
        <div className="field"><label>Account</label><select value={reconcileAccount} onChange={e=>setReconcileAccount(e.target.value)}>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
        <div className="field"><label>Actual balance (UGX)</label><input type="number" min="0" value={actual} onChange={e=>setActual(Number(e.target.value))}/></div>
        <div className="field"><label>Reason / note (optional)</label><input value={reason} onChange={e=>setReason(e.target.value)}/></div>
        <button className="btn primary" disabled={busy||!reconcileAccount} onClick={reconcile}>Reconcile</button>
      </div>
    </div>
    <div className="tablewrap" style={{marginTop:16}}><table><thead><tr><th>Date</th><th>Account</th><th>System</th><th>Actual</th><th>Difference</th></tr></thead><tbody>{reconciliations.length===0?<tr><td colSpan={5}>No reconciliations yet.</td></tr>:reconciliations.map(r=><tr key={r.id}><td>{r.business_date??new Date(r.reconciled_at).toLocaleDateString()}</td><td>{r.finance_accounts?.name??"Account"}</td><td>{ugx(Number(r.system_balance))}</td><td>{ugx(Number(r.actual_balance))}</td><td><b>{ugx(Number(r.difference))}</b></td></tr>)}</tbody></table></div>
  </>;
}
