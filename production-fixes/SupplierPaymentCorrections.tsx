'use client';

import { useEffect,useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ugx } from "@/lib/costing";

export default function SupplierPaymentCorrections({live,canCorrect}:{live:boolean;canCorrect:boolean}){
  const [rows,setRows]=useState<any[]>([]);
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);

  async function load(){
    if(!live)return;
    const supabase=createClient();
    const {data,error}=await supabase
      .from("purchase_payments")
      .select("id,purchase_id,amount,method,reference,paid_at,shift_id,edited_at,edit_reason,voided_at,void_reason,voided_original_amount,purchases(purchase_no,suppliers(name))")
      .order("paid_at",{ascending:false})
      .limit(100);
    if(error){setMessage(error.message);return;}
    setRows(data??[]);
  }
  useEffect(()=>{void load();},[live]);

  async function edit(row:any){
    if(!canCorrect){setMessage("You do not have correction permission.");return;}
    const amountRaw=window.prompt("Correct payment amount:",String(row.amount??""));
    if(amountRaw===null)return;
    const amount=Number(amountRaw);
    const method=window.prompt("Method: cash, bank, mtn_momo or airtel_money",row.method??"cash");
    if(method===null)return;
    const reference=method==="cash"?"":window.prompt("Payment reference:",row.reference??"");
    if(reference===null)return;
    const why=window.prompt("Why are you correcting this supplier payment?");
    if(!why?.trim())return;
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {error}=await supabase.rpc("edit_supplier_payment",{
        p_payment_id:row.id,p_amount:amount,p_method:method,
        p_reference:reference.trim()||null,p_shift_id:row.shift_id??null,p_edit_reason:why.trim()
      });
      if(error)throw error;
      setMessage("Supplier payment corrected.");
      await load();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not correct supplier payment.");}
    finally{setBusy(false);}
  }

  async function voidRow(row:any){
    if(!canCorrect){setMessage("You do not have correction permission.");return;}
    const why=window.prompt("Reason for deleting / voiding this supplier payment:");
    if(!why?.trim())return;
    if(!window.confirm("Void this supplier payment? The supplier balance will be recalculated."))return;
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {error}=await supabase.rpc("void_supplier_payment",{p_payment_id:row.id,p_void_reason:why.trim()});
      if(error)throw error;
      setMessage("Supplier payment voided and purchase balance recalculated.");
      await load();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not void supplier payment.");}
    finally{setBusy(false);}
  }

  async function restore(row:any){
    const why=window.prompt("Reason for restoring this supplier payment:");
    if(!why?.trim())return;
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {error}=await supabase.rpc("restore_supplier_payment",{p_payment_id:row.id,p_restore_reason:why.trim()});
      if(error)throw error;
      setMessage("Supplier payment restored.");
      await load();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not restore supplier payment.");}
    finally{setBusy(false);}
  }

  return <div className="card" style={{marginTop:16}}>
    <h2 style={{color:"var(--brown)",marginTop:0}}>Supplier Payment Corrections</h2>
    <p style={{color:"var(--muted)"}}>Edit an active payment, or void it so it no longer reduces the supplier balance. Voided payments can be restored.</p>
    {message&&<div className="hero" style={{padding:12}}><b>{message}</b></div>}
    <div className="tablewrap"><table>
      <thead><tr><th>Date</th><th>Supplier</th><th>Purchase</th><th>Amount</th><th>Method</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>{rows.length===0?<tr><td colSpan={7}>No supplier payments found.</td></tr>:rows.map(r=><tr key={r.id}>
        <td>{new Date(r.paid_at).toLocaleString()}</td>
        <td>{r.purchases?.suppliers?.name??"—"}</td>
        <td>{r.purchases?.purchase_no??"—"}</td>
        <td><b>{ugx(Number(r.voided_at?(r.voided_original_amount??0):r.amount))}</b></td>
        <td>{r.method}</td>
        <td>{r.voided_at?<span className="badge red">VOIDED</span>:r.edited_at?<span className="badge gold">EDITED</span>:<span className="badge green">ACTIVE</span>}</td>
        <td>{!canCorrect?<span>—</span>:r.voided_at
          ?<button className="btn primary" disabled={busy} onClick={()=>restore(r)}>Restore</button>
          :<div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button className="btn secondary" disabled={busy} onClick={()=>edit(r)}>Edit</button><button className="btn secondary" disabled={busy} onClick={()=>voidRow(r)}>Delete / Void</button></div>}
        </td>
      </tr>)}</tbody>
    </table></div>
  </div>;
}
