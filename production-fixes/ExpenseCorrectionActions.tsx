'use client';

import { createClient } from "@/lib/supabase/client";

export default function ExpenseCorrectionActions({
  row,live,canCorrect,onMessage,onDone
}:{row:any;live:boolean;canCorrect:boolean;onMessage:(m:string)=>void;onDone?:()=>void}){
  async function edit(){
    if(!canCorrect){onMessage("You do not have correction permission.");return;}
    const category=window.prompt("Expense category:",row.category??"");
    if(category===null)return;
    const description=window.prompt("Expense description:",row.description??"");
    if(description===null)return;
    const amountRaw=window.prompt("Expense amount:",String(row.amount??""));
    if(amountRaw===null)return;
    const amount=Number(amountRaw);
    const method=window.prompt("Payment method: cash, mtn_momo, airtel_money or bank",row.payment_method??"cash");
    if(method===null)return;
    let reference=row.reference??"";
    if(method!=="cash"){
      const next=window.prompt("Payment reference:",reference);
      if(next===null)return;
      reference=next;
    }
    const correction=window.prompt("Why are you correcting this expense?");
    if(!correction?.trim())return;
    if(!live){onMessage("Demo mode: expense correction simulated.");return;}
    try{
      const supabase=createClient();
      const {error}=await supabase.rpc("edit_expense",{
        p_expense_id:row.id,
        p_category:category.trim(),
        p_description:description.trim(),
        p_amount:amount,
        p_payment_method:method,
        p_reference:reference.trim()||null,
        p_shift_id:row.shift_id??null,
        p_edit_reason:correction.trim(),
      });
      if(error)throw error;
      onMessage("Expense corrected. Previous values remain in the audit log.");
      onDone?.();
    }catch(e){onMessage(e instanceof Error?e.message:"Could not correct expense.");}
  }

  async function voidRow(){
    if(!canCorrect){onMessage("You do not have correction permission.");return;}
    const reason=window.prompt("Reason for deleting / voiding this expense:");
    if(!reason?.trim())return;
    if(!window.confirm("Delete / void this expense? It will stop affecting totals but remain in the audit history."))return;
    if(!live){onMessage("Demo mode: expense void simulated.");return;}
    try{
      const supabase=createClient();
      const {error}=await supabase.rpc("void_expense",{p_expense_id:row.id,p_void_reason:reason.trim()});
      if(error)throw error;
      onMessage("Expense deleted / voided.");
      onDone?.();
    }catch(e){onMessage(e instanceof Error?e.message:"Could not void expense.");}
  }

  async function restore(){
    if(!canCorrect){onMessage("You do not have correction permission.");return;}
    const reason=window.prompt("Reason for restoring this expense:");
    if(!reason?.trim())return;
    if(!live){onMessage("Demo mode: expense restore simulated.");return;}
    try{
      const supabase=createClient();
      const {error}=await supabase.rpc("restore_expense",{p_expense_id:row.id,p_restore_reason:reason.trim()});
      if(error)throw error;
      onMessage("Expense restored.");
      onDone?.();
    }catch(e){onMessage(e instanceof Error?e.message:"Could not restore expense.");}
  }

  if(!canCorrect)return <span style={{color:"var(--muted)"}}>No correction access</span>;
  if(row.voided_at)return <button className="btn primary" onClick={restore}>Restore</button>;

  return <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
    <button className="btn secondary" onClick={edit}>Edit</button>
    <button className="btn secondary" onClick={voidRow}>Delete / Void</button>
  </div>;
}
