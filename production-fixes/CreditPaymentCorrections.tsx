'use client';

import { useEffect,useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ugx } from "@/lib/costing";

export default function CreditPaymentCorrections({live,canCorrect}:{live:boolean;canCorrect:boolean}){
  const router=useRouter();
  const [rows,setRows]=useState<any[]>([]);
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);

  async function load(){
    if(!live)return;
    const supabase=createClient();
    const {data,error}=await supabase
      .from("customer_credit_ledger_detail")
      .select("*")
      .eq("entry_type","payment")
      .order("created_at",{ascending:false})
      .limit(100);
    if(error){setMessage(error.message);return;}
    setRows(data??[]);
  }
  useEffect(()=>{void load();},[live]);

  async function reverse(row:any){
    const why=window.prompt("Reason for reversing this credit repayment:");
    if(!why?.trim())return;
    if(!window.confirm("Reverse this repayment? The customer's outstanding credit will increase again."))return;
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {error}=await supabase.rpc("reverse_credit_payment",{p_ledger_id:row.id,p_reverse_reason:why.trim()});
      if(error)throw error;
      setMessage("Credit repayment reversed. Enter the correct repayment if needed.");
      await load();
      router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not reverse credit payment.");}
    finally{setBusy(false);}
  }

  async function restore(row:any){
    const why=window.prompt("Reason for restoring this credit repayment:");
    if(!why?.trim())return;
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {error}=await supabase.rpc("restore_credit_payment",{p_ledger_id:row.id,p_restore_reason:why.trim()});
      if(error)throw error;
      setMessage("Credit repayment restored.");
      await load();
      router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not restore credit payment.");}
    finally{setBusy(false);}
  }

  return <div className="card" style={{marginTop:16}}>
    <h2 style={{color:"var(--brown)",marginTop:0}}>Credit Repayment Corrections</h2>
    <p style={{color:"var(--muted)"}}>Credit repayments are reversed rather than edited. If the amount was wrong, reverse it and record the correct repayment.</p>
    {message&&<div className="hero" style={{padding:12}}><b>{message}</b></div>}
    <div className="tablewrap"><table>
      <thead><tr><th>Date</th><th>Customer</th><th>Amount</th><th>Method</th><th>Reference</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>{rows.length===0?<tr><td colSpan={7}>No credit repayments found.</td></tr>:rows.map(r=><tr key={r.id}>
        <td>{new Date(r.created_at).toLocaleString()}</td>
        <td>{r.customer_name}</td>
        <td><b>{ugx(Math.abs(Number(r.reversed_at?(r.reversed_original_amount_delta??0):r.amount_delta)))}</b></td>
        <td>{r.payment_method??"—"}</td>
        <td>{r.reference??"—"}</td>
        <td>{r.reversed_at?<span className="badge red">REVERSED</span>:<span className="badge green">ACTIVE</span>}</td>
        <td>{!canCorrect?<span>—</span>:r.reversed_at
          ?<button className="btn primary" disabled={busy} onClick={()=>restore(r)}>Restore</button>
          :<button className="btn secondary" disabled={busy} onClick={()=>reverse(r)}>Reverse / Delete</button>}
        </td>
      </tr>)}</tbody>
    </table></div>
  </div>;
}
