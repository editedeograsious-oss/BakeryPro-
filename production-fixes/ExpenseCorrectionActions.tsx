'use client';

import { createClient } from "@/lib/supabase/client";
import { useRef,useState } from "react";

export default function ExpenseCorrectionActions({
  row,live,canCorrect,onMessage,onDone,operationsAllowed=false,operationsReason="Business operations are locked."
}:{row:any;live:boolean;canCorrect:boolean;onMessage:(m:string)=>void;onDone?:()=>void;operationsAllowed?:boolean;operationsReason?:string}){
  const [busy,setBusy]=useState(false);
  const inFlight=useRef(false);
  function permitted(){
    if(!canCorrect){onMessage("You do not have correction permission.");return false;}
    if(!live){onMessage("Expense corrections require a connected database.");return false;}
    if(!operationsAllowed){onMessage(operationsReason);return false;}
    return !inFlight.current;
  }
  async function edit(){
    if(!permitted())return;
    if(row.category==="Payroll"){onMessage("Correct salary payments from Staff Salaries & Payroll.");return;}
    if(!canCorrect){onMessage("You do not have correction permission.");return;}
    const category=window.prompt("Expense category:",row.category??"");
    if(category===null)return;
    const description=window.prompt("Expense description:",row.description??"");
    if(description===null)return;
    const amountRaw=window.prompt("Expense amount:",String(row.amount??""));
    if(amountRaw===null)return;
    const amount=Number(amountRaw);
    if(!Number.isFinite(amount)||amount<=0){onMessage("Enter a valid positive amount.");return;}
    const method=window.prompt("Payment method: cash, mtn_momo, airtel_money or bank",row.payment_method??"cash");
    if(method===null)return;
    if(!["cash","mtn_momo","airtel_money","bank"].includes(method)){onMessage("Choose a valid payment method.");return;}
    let reference=row.reference??"";
    if(method!=="cash"){
      const next=window.prompt("Payment reference:",reference);
      if(next===null)return;
      reference=next;
      if(!reference.trim()){onMessage("Enter a transaction reference.");return;}
    }
    const correction=window.prompt("Why are you correcting this expense?");
    if(!correction?.trim())return;
    if(!permitted())return;
    inFlight.current=true;setBusy(true);
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
    }catch(e){onMessage(e&&typeof e==="object"&&"message" in e?String(e.message):"Could not correct expense.");}
    finally{inFlight.current=false;setBusy(false);}
  }

  async function voidRow(){
    if(!permitted())return;
    if(row.category==="Payroll"){onMessage("Reverse salary payments from Staff Salaries & Payroll.");return;}
    if(!canCorrect){onMessage("You do not have correction permission.");return;}
    const reason=window.prompt("Reason for deleting / voiding this expense:");
    if(!reason?.trim())return;
    if(!window.confirm("Delete / void this expense? It will stop affecting totals but remain in the audit history."))return;
    if(!permitted())return;
    inFlight.current=true;setBusy(true);
    try{
      const supabase=createClient();
      const {error}=await supabase.rpc("void_expense",{p_expense_id:row.id,p_void_reason:reason.trim()});
      if(error)throw error;
      onMessage("Expense deleted / voided.");
      onDone?.();
    }catch(e){onMessage(e&&typeof e==="object"&&"message" in e?String(e.message):"Could not void expense.");}
    finally{inFlight.current=false;setBusy(false);}
  }

  async function restore(){
    if(!permitted())return;
    if(row.category==="Payroll"){onMessage("Restore salary payments from Staff Salaries & Payroll.");return;}
    if(!canCorrect){onMessage("You do not have correction permission.");return;}
    const reason=window.prompt("Reason for restoring this expense:");
    if(!reason?.trim())return;
    if(!permitted())return;
    inFlight.current=true;setBusy(true);
    try{
      const supabase=createClient();
      const {error}=await supabase.rpc("restore_expense",{p_expense_id:row.id,p_restore_reason:reason.trim()});
      if(error)throw error;
      onMessage("Expense restored.");
      onDone?.();
    }catch(e){onMessage(e&&typeof e==="object"&&"message" in e?String(e.message):"Could not restore expense.");}
    finally{inFlight.current=false;setBusy(false);}
  }

  if(row.category==="Payroll")return <a className="btn secondary" href="/payroll">Manage in Payroll</a>;
  if(!canCorrect)return <span style={{color:"var(--muted)"}}>No correction access</span>;
  const disabled=busy||!live||!operationsAllowed;
  if(row.voided_at)return <button className="btn primary" disabled={disabled} onClick={restore}>Restore</button>;

  return <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
    <button className="btn secondary" disabled={disabled} onClick={edit}>Edit</button>
    <button className="btn secondary" disabled={disabled} onClick={voidRow}>Delete / Void</button>
  </div>;
}
