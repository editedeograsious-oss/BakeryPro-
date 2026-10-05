'use client';

import { useEffect,useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ugx } from "@/lib/costing";

export default function CustomerOrderPaymentCorrections({live,canCorrect}:{live:boolean;canCorrect:boolean}){
  const router=useRouter();
  const [rows,setRows]=useState<any[]>([]);
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);

  async function load(){
    if(!live)return;
    const supabase=createClient();
    const {data,error}=await supabase
      .from("customer_order_payments")
      .select("id,order_id,method,amount,reference,payment_status,paid_at,shift_id,edited_at,edit_reason,voided_at,void_reason,customer_orders(order_no,customers(full_name))")
      .order("paid_at",{ascending:false})
      .limit(100);
    if(error){setMessage(error.message);return;}
    setRows(data??[]);
  }
  useEffect(()=>{void load();},[live]);

  async function edit(row:any){
    const amountRaw=window.prompt("Correct payment amount:",String(row.amount??""));
    if(amountRaw===null)return;
    const amount=Number(amountRaw);
    const method=window.prompt("Method: cash, mtn_momo, airtel_money or bank",row.method??"cash");
    if(method===null)return;
    const reference=method==="cash"?"":window.prompt("Payment reference:",row.reference??"");
    if(reference===null)return;
    const why=window.prompt("Why are you correcting this customer-order payment?");
    if(!why?.trim())return;
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {error}=await supabase.rpc("edit_customer_order_payment",{
        p_payment_id:row.id,p_amount:amount,p_method:method,
        p_reference:reference.trim()||null,p_shift_id:row.shift_id??null,p_edit_reason:why.trim()
      });
      if(error)throw error;
      setMessage("Customer-order payment corrected.");
      await load();
      router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not correct payment.");}
    finally{setBusy(false);}
  }

  async function voidRow(row:any){
    const why=window.prompt("Reason for deleting / voiding this customer-order payment:");
    if(!why?.trim())return;
    if(!window.confirm("Void this payment? It will stop counting toward the order balance."))return;
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {error}=await supabase.rpc("void_customer_order_payment",{p_payment_id:row.id,p_void_reason:why.trim()});
      if(error)throw error;
      setMessage("Customer-order payment voided.");
      await load();
      router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not void payment.");}
    finally{setBusy(false);}
  }

  async function restore(row:any){
    const why=window.prompt("Reason for restoring this customer-order payment:");
    if(!why?.trim())return;
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {error}=await supabase.rpc("restore_customer_order_payment",{p_payment_id:row.id,p_restore_reason:why.trim()});
      if(error)throw error;
      setMessage("Customer-order payment restored.");
      await load();
      router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not restore payment.");}
    finally{setBusy(false);}
  }

  return <div className="card" style={{marginTop:16}}>
    <h2 style={{color:"var(--brown)",marginTop:0}}>Customer Payment Corrections</h2>
    <p style={{color:"var(--muted)"}}>Correct deposits and order payments without erasing the audit trail.</p>
    {message&&<div className="hero" style={{padding:12}}><b>{message}</b></div>}
    <div className="tablewrap"><table>
      <thead><tr><th>Date</th><th>Order</th><th>Customer</th><th>Amount</th><th>Method</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>{rows.length===0?<tr><td colSpan={7}>No customer-order payments found.</td></tr>:rows.map(r=><tr key={r.id}>
        <td>{new Date(r.paid_at).toLocaleString()}</td>
        <td>{r.customer_orders?.order_no??"—"}</td>
        <td>{r.customer_orders?.customers?.full_name??"—"}</td>
        <td><b>{ugx(Number(r.amount))}</b></td>
        <td>{r.method}</td>
        <td>{r.payment_status==="voided"?<span className="badge red">VOIDED</span>:r.edited_at?<span className="badge gold">EDITED</span>:<span className="badge green">ACTIVE</span>}</td>
        <td>{!canCorrect?<span>—</span>:r.payment_status==="voided"
          ?<button className="btn primary" disabled={busy} onClick={()=>restore(r)}>Restore</button>
          :<div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button className="btn secondary" disabled={busy} onClick={()=>edit(r)}>Edit</button><button className="btn secondary" disabled={busy} onClick={()=>voidRow(r)}>Delete / Void</button></div>}
        </td>
      </tr>)}</tbody>
    </table></div>
  </div>;
}
