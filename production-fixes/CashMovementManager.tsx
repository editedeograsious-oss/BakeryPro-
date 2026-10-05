'use client';

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ugx } from "@/lib/costing";

export default function CashMovementManager({
  movements,shifts,live,role,canCorrect
}:{movements:any[];shifts:any[];live:boolean;role:string;canCorrect:boolean}){
  const router=useRouter();
  const [type,setType]=useState("cash_out");
  const [amount,setAmount]=useState(0);
  const [reason,setReason]=useState("");
  const [reference,setReference]=useState("");
  const [shiftId,setShiftId]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const requestId=useRef(crypto.randomUUID());

  const [editing,setEditing]=useState<any|null>(null);
  const [editType,setEditType]=useState("cash_out");
  const [editAmount,setEditAmount]=useState(0);
  const [editReason,setEditReason]=useState("");
  const [editReference,setEditReference]=useState("");
  const [editShiftId,setEditShiftId]=useState("");
  const [correctionReason,setCorrectionReason]=useState("");

  const active=useMemo(()=>movements.filter(m=>!m.voided_at),[movements]);
  const voided=useMemo(()=>movements.filter(m=>!!m.voided_at),[movements]);
  const cashIn=useMemo(()=>active.filter(m=>m.movement_type==="cash_in").reduce((s,m)=>s+Number(m.amount||0),0),[active]);
  const cashOut=useMemo(()=>active.filter(m=>m.movement_type==="cash_out").reduce((s,m)=>s+Number(m.amount||0),0),[active]);

  async function save(){
    if(amount<=0||!reason.trim()){setMessage("Positive amount and reason are required.");return;}
    if(!live){setMessage("Demo mode: cash movement simulated.");return;}
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {data,error}=await supabase.rpc("record_cash_movement",{
        p_movement_type:type,
        p_amount:amount,
        p_reason:reason.trim(),
        p_reference:reference.trim()||null,
        p_shift_id:shiftId||null,
        p_client_request_id:requestId.current,
      });
      if(error)throw error;
      setMessage(`Cash movement recorded • ${data}`);
      requestId.current=crypto.randomUUID();
      setAmount(0);setReason("");setReference("");
      router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not record cash movement.");}
    finally{setBusy(false);}
  }

  function startEdit(row:any){
    if(!canCorrect){setMessage("You do not have permission to correct recorded transactions.");return;}
    if(row.voided_at){setMessage("Restore this record before editing it.");return;}
    setEditing(row);
    setEditType(row.movement_type);
    setEditAmount(Number(row.amount||0));
    setEditReason(row.reason??"");
    setEditReference(row.reference??"");
    setEditShiftId(row.shift_id??"");
    setCorrectionReason("");
    setMessage("");
  }

  async function saveEdit(){
    if(!editing)return;
    if(editAmount<=0||!editReason.trim()||!correctionReason.trim()){
      setMessage("Amount, reason and correction reason are required.");
      return;
    }
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {error}=await supabase.rpc("edit_cash_movement",{
        p_movement_id:editing.id,
        p_movement_type:editType,
        p_amount:editAmount,
        p_reason:editReason.trim(),
        p_reference:editReference.trim()||null,
        p_shift_id:editShiftId||null,
        p_edit_reason:correctionReason.trim(),
      });
      if(error)throw error;
      setEditing(null);
      setCorrectionReason("");
      setMessage("Cash movement corrected. The previous values remain in the audit log.");
      router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not correct cash movement.");}
    finally{setBusy(false);}
  }

  async function voidMovement(row:any){
    if(!canCorrect){setMessage("You do not have permission to correct recorded transactions.");return;}
    const why=window.prompt("Reason for deleting / voiding this cash movement:");
    if(why===null)return;
    if(!why.trim()){setMessage("Deletion / void reason is required.");return;}
    if(!window.confirm("Delete / void this cash movement? It will stop affecting cash totals, but remain in the audit history."))return;
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {error}=await supabase.rpc("void_cash_movement",{
        p_movement_id:row.id,
        p_void_reason:why.trim(),
      });
      if(error)throw error;
      setMessage("Cash movement deleted / voided. It no longer affects totals.");
      router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not void cash movement.");}
    finally{setBusy(false);}
  }

  async function restoreMovement(row:any){
    if(!canCorrect){setMessage("You do not have permission to correct recorded transactions.");return;}
    const why=window.prompt("Reason for restoring this cash movement:");
    if(why===null)return;
    if(!why.trim()){setMessage("Restore reason is required.");return;}
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {error}=await supabase.rpc("restore_cash_movement",{
        p_movement_id:row.id,
        p_restore_reason:why.trim(),
      });
      if(error)throw error;
      setMessage("Cash movement restored and included in totals again.");
      router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not restore cash movement.");}
    finally{setBusy(false);}
  }

  return <>
    <div className="pagehead">
      <div><h1>Cash In / Out</h1><p>Manual cash movements outside customer sales and opening float.</p></div>
      {canCorrect&&<span className="badge gold">Edit / Correction Enabled</span>}
    </div>
    {message&&<div className="hero" style={{padding:14}}><b>{message}</b></div>}

    <div className="hero">
      <h2>Corrections are protected</h2>
      <p>If you make a mistake, use <b>Edit</b> to correct it or <b>Delete / Void</b> to remove its effect from cash totals. Every correction keeps the old values, user, date and reason in the audit log.</p>
    </div>

    <div className="grid4">
      <div className="card stat"><div className="label">Cash In</div><div className="value">{ugx(cashIn)}</div></div>
      <div className="card stat"><div className="label">Cash Out</div><div className="value">{ugx(cashOut)}</div></div>
      <div className="card stat"><div className="label">Net Manual Movement</div><div className="value">{ugx(cashIn-cashOut)}</div></div>
      <div className="card stat"><div className="label">Active / Voided</div><div className="value">{active.length} / {voided.length}</div></div>
    </div>

    <div className="card" style={{marginTop:16}}>
      <h3 style={{color:"var(--brown)",marginTop:0}}>Record Manual Cash Movement</h3>
      <div className="grid2">
        <div className="field"><label>Type</label><select value={type} onChange={e=>setType(e.target.value)}><option value="cash_in">Cash In</option><option value="cash_out">Cash Out</option></select></div>
        <div className="field"><label>Amount</label><input type="number" min="0.01" value={amount} onChange={e=>setAmount(Number(e.target.value))}/></div>
      </div>
      <div className="field"><label>Reason</label><input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Owner top-up / petty cash / bank deposit…"/></div>
      <div className="grid2">
        <div className="field"><label>Reference (optional)</label><input value={reference} onChange={e=>setReference(e.target.value)}/></div>
        <div className="field"><label>Cashier shift {role==="cashier"?"(your open shift is enforced)":"(optional)"}</label><select value={shiftId} onChange={e=>setShiftId(e.target.value)}><option value="">Auto / general business cash</option>{shifts.map(s=><option key={s.id} value={s.id}>{s.cashier_name}</option>)}</select></div>
      </div>
      <button className="btn primary" disabled={busy} onClick={save}>{busy?"Working…":"Record Movement"}</button>
    </div>

    {editing&&<div className="card" style={{marginTop:16}}>
      <div className="pagehead" style={{marginBottom:8}}>
        <div><h2 style={{margin:0}}>Edit Cash Movement</h2><p style={{marginTop:6}}>Correct the wrong entry. The old values will stay in the audit log.</p></div>
        <button className="btn secondary" disabled={busy} onClick={()=>setEditing(null)}>Cancel</button>
      </div>
      <div className="grid2">
        <div className="field"><label>Type</label><select value={editType} onChange={e=>setEditType(e.target.value)}><option value="cash_in">Cash In</option><option value="cash_out">Cash Out</option></select></div>
        <div className="field"><label>Amount</label><input type="number" min="0.01" value={editAmount} onChange={e=>setEditAmount(Number(e.target.value))}/></div>
      </div>
      <div className="field"><label>Reason</label><input value={editReason} onChange={e=>setEditReason(e.target.value)}/></div>
      <div className="grid2">
        <div className="field"><label>Reference</label><input value={editReference} onChange={e=>setEditReference(e.target.value)}/></div>
        <div className="field"><label>Cashier shift</label><select value={editShiftId} onChange={e=>setEditShiftId(e.target.value)}><option value="">General business cash</option>{shifts.map(s=><option key={s.id} value={s.id}>{s.cashier_name}</option>)}</select></div>
      </div>
      <div className="field"><label>Why are you correcting this record?</label><input value={correctionReason} onChange={e=>setCorrectionReason(e.target.value)} placeholder="Wrong amount / wrong type / typing mistake…"/></div>
      <button className="btn primary" disabled={busy} onClick={saveEdit}>{busy?"Saving…":"Save Correction"}</button>
    </div>}

    <div className="tablewrap" style={{marginTop:16}}>
      <table>
        <thead><tr><th>Date</th><th>Type</th><th>Reason</th><th>Amount</th><th>Reference</th><th>Recorded By</th><th>Shift</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>{movements.length===0?<tr><td colSpan={9}>No manual cash movements found.</td></tr>:movements.map(m=><tr key={m.id} style={m.voided_at?{opacity:.65}:{}}>
          <td>{new Date(m.created_at).toLocaleString()}</td>
          <td><span className={m.movement_type==="cash_in"?"badge green":"badge gold"}>{m.movement_type.replace("_"," ")}</span></td>
          <td>
            {m.reason}
            {m.edited_at&&<div style={{fontSize:11,color:"var(--muted)"}}>Edited: {m.edit_reason??"correction"}</div>}
            {m.voided_at&&<div style={{fontSize:11,color:"var(--muted)"}}>Void reason: {m.void_reason??"—"}</div>}
          </td>
          <td><b style={m.voided_at?{textDecoration:"line-through"}:{}}>{ugx(Number(m.display_amount??m.amount??0))}</b></td>
          <td>{m.reference??"—"}</td>
          <td>{m.created_by_name??"—"}</td>
          <td>{m.shift_cashier_name??"—"}</td>
          <td>{m.voided_at?<span className="badge red">VOIDED</span>:m.edited_at?<span className="badge gold">EDITED</span>:<span className="badge green">ACTIVE</span>}</td>
          <td>
            {!canCorrect?<span style={{color:"var(--muted)"}}>No correction access</span>:m.voided_at
              ?<button className="btn primary" disabled={busy} onClick={()=>restoreMovement(m)}>Restore</button>
              :<div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <button className="btn secondary" disabled={busy} onClick={()=>startEdit(m)}>Edit</button>
                <button className="btn secondary" disabled={busy} onClick={()=>voidMovement(m)}>Delete / Void</button>
              </div>}
          </td>
        </tr>)}</tbody>
      </table>
    </div>
  </>;
}
