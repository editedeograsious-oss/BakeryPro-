"use client";

import { useMemo,useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ugx } from "@/lib/costing";

const roleLabels:Record<string,string>={
  owner:"CEO / Owner",
  manager:"General Manager",
  baker:"Head Baker",
  storekeeper:"Stock Manager",
  cashier:"Sales Team"
};

export default function PayrollManager({
  staff,compensation,runs,items,advances,live,canCorrect
}:{
  staff:any[];compensation:any[];runs:any[];items:any[];advances:any[];
  live:boolean;canCorrect:boolean;
}){
  const router=useRouter();
  const [staffId,setStaffId]=useState(staff[0]?.id??"");
  const current=compensation.find((x:any)=>x.staff_id===staffId);
  const [salaryType,setSalaryType]=useState(current?.salary_type??"monthly");
  const [basic,setBasic]=useState(Number(current?.basic_salary??0));
  const [allowances,setAllowances]=useState(Number(current?.default_allowances??0));
  const [deductions,setDeductions]=useState(Number(current?.default_deductions??0));
  const [effectiveFrom,setEffectiveFrom]=useState(current?.effective_from??new Date().toISOString().slice(0,10));
  const [notes,setNotes]=useState(current?.notes??"");
  const [advanceAmount,setAdvanceAmount]=useState(0);
  const [advanceReason,setAdvanceReason]=useState("");
  const [month,setMonth]=useState(new Date().toISOString().slice(0,7));
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);

  const unpaid=useMemo(()=>items.filter((x:any)=>x.payment_status==="unpaid"),[items]);
  const reversed=useMemo(()=>items.filter((x:any)=>x.payment_status==="void"),[items]);
  const gross=useMemo(()=>items.reduce((s:number,x:any)=>s+Number(x.gross_pay||0),0),[items]);
  const net=useMemo(()=>items.reduce((s:number,x:any)=>s+Number(x.net_pay||0),0),[items]);
  const openAdvances=useMemo(()=>advances.filter((x:any)=>x.status==="open").reduce((s:number,x:any)=>s+Number(x.remaining_amount??x.amount??0),0),[advances]);
  const configuredIds=useMemo(()=>new Set(compensation.map((x:any)=>x.staff_id)),[compensation]);
  const missingSetup=useMemo(()=>staff.filter((s:any)=>!configuredIds.has(s.id)),[staff,configuredIds]);

  function chooseStaff(id:string){
    setStaffId(id);
    const c=compensation.find((x:any)=>x.staff_id===id);
    setSalaryType(c?.salary_type??"monthly");
    setBasic(Number(c?.basic_salary??0));
    setAllowances(Number(c?.default_allowances??0));
    setDeductions(Number(c?.default_deductions??0));
    setEffectiveFrom(c?.effective_from??new Date().toISOString().slice(0,10));
    setNotes(c?.notes??"");
  }

  async function call(name:string,args:Record<string,any>,success:string){
    if(!live){setMessage(`Demo mode: ${success}`);return null;}
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {data,error}=await supabase.rpc(name,args);
      if(error)throw error;
      setMessage(success);
      router.refresh();
      return data;
    }catch(e){
      setMessage(e instanceof Error?e.message:"Payroll action failed.");
      return null;
    }finally{setBusy(false);}
  }

  async function saveCompensation(){
    if(!staffId||basic<0||allowances<0||deductions<0){
      setMessage("Select staff and enter valid non-negative salary values.");return;
    }
    await call("save_staff_compensation",{
      p_staff_id:staffId,p_salary_type:salaryType,p_basic_salary:basic,
      p_allowances:allowances,p_deductions:deductions,
      p_effective_from:effectiveFrom,p_notes:notes.trim()||null
    },"Salary setup saved.");
  }

  async function saveAdvance(){
    if(!staffId||advanceAmount<=0||!advanceReason.trim()){
      setMessage("Select staff, enter a positive advance and a reason.");return;
    }
    const ok=await call("record_salary_advance",{
      p_staff_id:staffId,p_amount:advanceAmount,p_reason:advanceReason.trim()
    },"Salary advance recorded.");
    if(ok!==null){setAdvanceAmount(0);setAdvanceReason("");}
  }

  async function generate(){
    if(!month){setMessage("Choose the payroll month.");return;}
    await call("generate_payroll_run",{p_payroll_month:`${month}-01`},`Payroll generated for ${month}.`);
  }

  async function editItem(item:any){
    if(item.payment_status!=="unpaid"){
      setMessage("Only unpaid salary items can be adjusted. Reverse and reopen a paid item first.");return;
    }
    const a=window.prompt("Allowances (UGX)",String(item.allowances??0));if(a===null)return;
    const d=window.prompt("Other deductions (UGX)",String(item.deductions??0));if(d===null)return;
    const ad=window.prompt("Salary advance deduction (UGX)",String(item.advance_deduction??0));if(ad===null)return;
    const n=window.prompt("Payroll note",item.notes??"");if(n===null)return;
    const av=Number(a),dv=Number(d),adv=Number(ad);
    if([av,dv,adv].some(x=>!Number.isFinite(x)||x<0)){
      setMessage("Payroll adjustments must be valid non-negative amounts.");return;
    }
    await call("update_payroll_item",{
      p_item_id:item.id,p_allowances:av,p_deductions:dv,
      p_advance_deduction:adv,p_notes:n.trim()||null
    },"Payroll item updated.");
  }

  async function pay(item:any){
    if(item.payment_status!=="unpaid")return;
    const method=window.prompt(
      "Payment method: cash, bank, mtn_momo or airtel_money","cash"
    );
    if(method===null)return;
    if(!["cash","bank","mtn_momo","airtel_money"].includes(method)){
      setMessage("Use cash, bank, mtn_momo or airtel_money.");return;
    }
    let reference:string|null=null;
    if(method!=="cash"){
      reference=window.prompt("Payment reference","");
      if(reference===null)return;
      if(!reference.trim()){setMessage("Reference is required for non-cash salary payment.");return;}
    }
    if(!window.confirm(
      `Pay ${item.full_name} ${ugx(Number(item.net_pay||0))}? This creates a Payroll expense.`
    ))return;
    await call("pay_payroll_item",{
      p_item_id:item.id,p_method:method,p_reference:reference?.trim()||null
    },"Salary paid and Payroll expense recorded.");
  }

  async function reversePayment(item:any){
    if(!canCorrect){setMessage("You do not have payroll correction permission.");return;}
    const why=window.prompt("Reason for reversing this salary payment:");
    if(!why?.trim())return;
    if(!window.confirm(
      "Reverse this salary payment? The Payroll expense will be voided and salary-advance deductions restored."
    ))return;
    await call("reverse_payroll_payment",{
      p_item_id:item.id,p_reason:why.trim()
    },"Salary payment reversed safely.");
  }

  async function restorePayment(item:any){
    if(!canCorrect){setMessage("You do not have payroll correction permission.");return;}
    const why=window.prompt("Reason for restoring this reversed salary payment:");
    if(!why?.trim())return;
    await call("restore_payroll_payment",{
      p_item_id:item.id,p_reason:why.trim()
    },"Salary payment restored.");
  }

  async function reopenItem(item:any){
    if(!canCorrect){setMessage("You do not have payroll correction permission.");return;}
    const why=window.prompt("Why are you reopening this reversed salary for correction?");
    if(!why?.trim())return;
    if(!window.confirm(
      "Reopen this payroll item? The old Payroll expense stays voided. You can then adjust and pay the corrected salary."
    ))return;
    await call("reopen_payroll_item",{
      p_item_id:item.id,p_reason:why.trim()
    },"Payroll item reopened for correction.");
  }

  return <>
    <div className="pagehead">
      <div>
        <h1>Staff Salaries & Payroll</h1>
        <p>Salary setup, advances, monthly payroll, payments, expenses and safe corrections.</p>
      </div>
    </div>

    {message&&<div className="hero" style={{padding:14}}><b>{message}</b></div>}

    <div className="grid4">
      <div className="card stat"><div className="label">Salary Setups</div><div className="value">{compensation.length}/{staff.length}</div></div>
      <div className="card stat"><div className="label">Loaded Gross Pay</div><div className="value">{ugx(gross)}</div></div>
      <div className="card stat"><div className="label">Loaded Net Pay</div><div className="value">{ugx(net)}</div></div>
      <div className="card stat"><div className="label">Open Advances</div><div className="value">{ugx(openAdvances)}</div></div>
    </div>

    {missingSetup.length>0&&<div className="hero" style={{marginTop:16}}>
      <h2>Salary setup still required</h2>
      <p>
        Payroll now includes only active staff with a saved salary setup.
        Missing: <b>{missingSetup.map((s:any)=>s.full_name).join(", ")}</b>.
      </p>
    </div>}

    <div className="grid2" style={{marginTop:16}}>
      <div className="card">
        <h3 style={{color:"var(--brown)",marginTop:0}}>Staff Salary Setup</h3>
        <div className="field">
          <label>Staff member</label>
          <select value={staffId} onChange={e=>chooseStaff(e.target.value)}>
            <option value="">Select staff</option>
            {staff.map((s:any)=><option key={s.id} value={s.id}>{s.full_name} • {roleLabels[s.role]??s.role}</option>)}
          </select>
        </div>
        <div className="grid2">
          <div className="field"><label>Salary type</label><select value={salaryType} onChange={e=>setSalaryType(e.target.value)}><option value="monthly">Monthly</option><option value="daily">Daily</option><option value="hourly">Hourly</option></select></div>
          <div className="field"><label>Basic salary / rate</label><input type="number" min="0" value={basic} onChange={e=>setBasic(Number(e.target.value))}/></div>
        </div>
        <div className="grid2">
          <div className="field"><label>Default allowances</label><input type="number" min="0" value={allowances} onChange={e=>setAllowances(Number(e.target.value))}/></div>
          <div className="field"><label>Default deductions</label><input type="number" min="0" value={deductions} onChange={e=>setDeductions(Number(e.target.value))}/></div>
        </div>
        <div className="grid2">
          <div className="field"><label>Effective from</label><input type="date" value={effectiveFrom} onChange={e=>setEffectiveFrom(e.target.value)}/></div>
          <div className="field"><label>Notes</label><input value={notes} onChange={e=>setNotes(e.target.value)}/></div>
        </div>
        <button className="btn primary" disabled={busy||!staffId} onClick={saveCompensation}>Save Salary Setup</button>
      </div>

      <div className="card">
        <h3 style={{color:"var(--brown)",marginTop:0}}>Salary Advance</h3>
        <p style={{color:"var(--muted)"}}>Advances remain open until deducted through payroll.</p>
        <div className="field"><label>Staff member</label><select value={staffId} onChange={e=>chooseStaff(e.target.value)}><option value="">Select staff</option>{staff.map((s:any)=><option key={s.id} value={s.id}>{s.full_name}</option>)}</select></div>
        <div className="field"><label>Advance amount</label><input type="number" min="0" value={advanceAmount} onChange={e=>setAdvanceAmount(Number(e.target.value))}/></div>
        <div className="field"><label>Reason</label><input value={advanceReason} onChange={e=>setAdvanceReason(e.target.value)} placeholder="Emergency advance / transport / other"/></div>
        <button className="btn secondary" disabled={busy||!staffId} onClick={saveAdvance}>Record Advance</button>
        <div style={{marginTop:16,maxHeight:230,overflow:"auto"}}>
          {advances.length===0?<p style={{color:"var(--muted)"}}>No salary advances recorded.</p>:advances.slice(0,20).map((a:any)=>{
            const s=staff.find((x:any)=>x.id===a.staff_id);
            return <div key={a.id} style={{padding:"8px 0",borderBottom:"1px solid var(--line)"}}>
              <b>{s?.full_name??"Staff"}</b> • {ugx(Number(a.amount))}
              {Number(a.remaining_amount??a.amount)!==Number(a.amount)&&<> • {ugx(Number(a.remaining_amount||0))} remaining</>}
              {" "}<span className={a.status==="open"?"badge gold":"badge green"}>{String(a.status).toUpperCase()}</span>
              <br/><small style={{color:"var(--muted)"}}>{a.reason}</small>
            </div>;
          })}
        </div>
      </div>
    </div>

    <div className="card" style={{marginTop:16}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"end",flexWrap:"wrap"}}>
        <div>
          <h3 style={{color:"var(--brown)",margin:"0 0 4px"}}>Generate Monthly Payroll</h3>
          <p style={{margin:0,color:"var(--muted)"}}>
            Creates salary lines only for active staff with a saved compensation profile.
          </p>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"end"}}>
          <div className="field" style={{margin:0}}>
            <label>Payroll month</label>
            <input type="month" value={month} onChange={e=>setMonth(e.target.value)}/>
          </div>
          <button className="btn primary" disabled={busy||compensation.length===0} onClick={generate}>Generate Payroll</button>
        </div>
      </div>
    </div>

    <div className="tablewrap" style={{marginTop:16}}>
      <table>
        <thead><tr>
          <th>Month</th><th>Staff</th><th>Role</th><th>Salary Basis</th><th>Rate</th><th>Units</th>
          <th>Base Pay</th><th>Allowances</th><th>Deductions</th><th>Advance</th><th>Net Pay</th>
          <th>Status</th><th>Payment</th><th>Actions</th>
        </tr></thead>
        <tbody>{items.length===0
          ?<tr><td colSpan={14}>No payroll has been generated yet.</td></tr>
          :items.map((i:any)=><tr key={i.id}>
            <td>{String(i.payroll_month).slice(0,7)}</td>
            <td><b>{i.full_name}</b></td>
            <td>{roleLabels[i.role]??i.role}</td>
            <td>{i.salary_type??"monthly"}</td>
            <td>{ugx(Number(i.salary_rate??i.basic_salary))}</td>
            <td>{Number(i.work_units??1).toLocaleString()}</td>
            <td>{ugx(Number(i.basic_salary))}</td>
            <td>{ugx(Number(i.allowances))}</td>
            <td>{ugx(Number(i.deductions))}</td>
            <td>{ugx(Number(i.advance_deduction))}</td>
            <td><b>{ugx(Number(i.net_pay))}</b></td>
            <td>
              {i.payment_status==="paid"
                ?<span className="badge green">PAID</span>
                :i.payment_status==="void"
                  ?<span className="badge red">REVERSED</span>
                  :<span className="badge gold">UNPAID</span>}
              {i.restored_at&&<><br/><small>Restored</small></>}
              {i.reopened_at&&<><br/><small>Reopened</small></>}
            </td>
            <td>
              {i.payment_method?String(i.payment_method).replaceAll("_"," "):"—"}
              {i.payment_reference&&<><br/><small>{i.payment_reference}</small></>}
            </td>
            <td>
              <div className="action-row">
                {i.payment_status==="unpaid"&&<>
                  <button className="btn secondary" disabled={busy} onClick={()=>editItem(i)}>Adjust</button>
                  <button className="btn primary" disabled={busy} onClick={()=>pay(i)}>Pay Salary</button>
                </>}
                {i.payment_status==="paid"&&canCorrect&&
                  <button className="btn secondary" disabled={busy} onClick={()=>reversePayment(i)}>Reverse</button>}
                {i.payment_status==="void"&&canCorrect&&<>
                  <button className="btn primary" disabled={busy} onClick={()=>restorePayment(i)}>Restore</button>
                  <button className="btn secondary" disabled={busy} onClick={()=>reopenItem(i)}>Reopen for Correction</button>
                </>}
              </div>
            </td>
          </tr>)}
        </tbody>
      </table>
    </div>

    <div style={{marginTop:10,color:"var(--muted)"}}>
      {unpaid.length>0&&<span>{unpaid.length} unpaid salary item(s). </span>}
      {reversed.length>0&&<span>{reversed.length} reversed salary item(s) awaiting restore or correction.</span>}
    </div>

    <div className="hero" style={{marginTop:16}}>
      <h2>Safe salary correction</h2>
      <p>
        Paid salary → <b>Reverse</b> to void the linked Payroll expense and restore advance deductions.
        Then <b>Restore</b> if the reversal was a mistake, or <b>Reopen for Correction</b> to adjust the payroll item and pay it again.
      </p>
    </div>
  </>;
}
