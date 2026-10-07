'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const ROLES=["manager","cashier","baker","storekeeper"] as const;
const ROLE_LABELS:Record<string,string>={owner:"CEO / Owner",manager:"General Manager",baker:"Head Baker",storekeeper:"Stock Manager",cashier:"Sales Team"};

export default function StaffAdminManager({staff,live}:{staff:any[];live:boolean}){
  const router=useRouter();
  const [email,setEmail]=useState("");
  const [name,setName]=useState("");
  const [role,setRole]=useState("cashier");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);

  async function invite(){
    if(!email.trim()||!name.trim()){setMessage("Email and staff name are required.");return;}
    if(!live){setMessage("Demo mode: staff invitation simulated.");return;}
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {data:{session},error:sessionError}=await supabase.auth.getSession();
      if(sessionError)throw sessionError;
      if(!session)throw new Error("Sign in again before inviting staff.");
      const res=await fetch("/api/staff/invite",{method:"POST",headers:{"content-type":"application/json","authorization":`Bearer ${session.access_token}`},body:JSON.stringify({email:email.trim(),full_name:name.trim(),role})});
      const body=await res.json();
      if(!res.ok)throw new Error(body?.error??"Could not invite staff member.");
      setMessage("Invitation created. The staff member must complete the email invite before login.");
      setEmail("");setName("");setRole("cashier");router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not invite staff member.");}
    finally{setBusy(false);}
  }

  async function toggle(row:any){
    if(row.role==="owner"){setMessage("CEO / Owner account is protected.");return;}
    const action=row.active?"disable":"re-enable";
    if(!window.confirm(`${action.charAt(0).toUpperCase()+action.slice(1)} ${row.full_name}? ${row.active?"They will lose access until re-enabled.":"They will regain access according to their role."}`))return;
    if(!live){setMessage("Demo mode: staff status change simulated.");return;}
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {error}=await supabase.rpc("set_staff_active",{p_staff_id:row.id,p_active:!row.active});
      if(error)throw error;
      setMessage(row.active?"Staff account disabled.":"Staff account re-enabled.");
      router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not change staff status.");}
    finally{setBusy(false);}
  }

  async function changeRole(id:string,next:string){
    if(!window.confirm(`Change this staff member to ${ROLE_LABELS[next]??next}? Their access permissions will change immediately.`))return;
    if(!live){setMessage(`Demo mode: role would change to ${ROLE_LABELS[next]??next}.`);return;}
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {error}=await supabase.rpc("change_staff_role",{p_staff_id:id,p_role:next});
      if(error)throw error;
      setMessage("Staff role changed.");
      router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not change role.");}
    finally{setBusy(false);}
  }

  return <>
    <div className="pagehead">
      <div><h1>Staff & Roles</h1><p>CEO / Owner-controlled staff invitations, business roles and account status.</p></div>
      <span className="badge red">CEO / Owner Only</span>
    </div>
    {message&&<div className="hero" style={{padding:14}}><b>{message}</b></div>}

    <div className="grid4">
      <div className="card stat"><div className="label">Active Staff</div><div className="value">{staff.filter(s=>s.active).length}</div></div>
      <div className="card stat"><div className="label">Disabled</div><div className="value">{staff.filter(s=>!s.active).length}</div></div>
      <div className="card stat"><div className="label">Roles</div><div className="value">5</div></div>
      <div className="card stat"><div className="label">CEO / Owner Accounts</div><div className="value">{staff.filter(s=>s.role==="owner").length}</div></div>
    </div>

    <div className="card" style={{marginTop:16}}>
      <h3 style={{color:"var(--brown)",marginTop:0}}>Invite Staff Member</h3>
      <div className="grid2">
        <div className="field"><label>Full name</label><input value={name} onChange={e=>setName(e.target.value)}/></div>
        <div className="field"><label>Email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)}/></div>
      </div>
      <div className="field"><label>Role</label><select value={role} onChange={e=>setRole(e.target.value)}>{ROLES.map(r=><option key={r} value={r}>{ROLE_LABELS[r]??r}</option>)}</select></div>
      <button className="btn primary" disabled={busy} onClick={invite}>{busy?"Working…":"Send Invitation"}</button>
      <p style={{color:"var(--muted)",fontSize:12}}>Live invitations require the server-only SUPABASE_SERVICE_ROLE_KEY. It is never sent to the browser.</p>
    </div>

    <div className="tablewrap" style={{marginTop:16}}>
      <table><thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Session Version</th><th>Last Sign-In</th><th>Role Change</th><th>Action</th></tr></thead>
      <tbody>{staff.map(s=><tr key={s.id}>
        <td><b>{s.full_name}</b></td><td>{ROLE_LABELS[s.role]??s.role}</td>
        <td><span className={s.active?"badge green":"badge red"}>{s.active?"Active":"Disabled"}</span></td>
        <td>{s.session_version??1}</td><td>{s.last_sign_in_at?new Date(s.last_sign_in_at).toLocaleString():"—"}</td>
        <td>{s.role==="owner"?<span style={{color:"var(--muted)"}}>Protected</span>:<select disabled={busy} value={s.role} onChange={e=>changeRole(s.id,e.target.value)}>{ROLES.map(r=><option key={r} value={r}>{ROLE_LABELS[r]??r}</option>)}</select>}</td>
        <td>{s.role==="owner"?<span style={{color:"var(--muted)"}}>Protected CEO / Owner</span>:<button className={s.active?"btn secondary":"btn primary"} disabled={busy} onClick={()=>toggle(s)}>{s.active?"Disable":"Re-enable"}</button>}</td>
      </tr>)}</tbody></table>
    </div>

    <div className="hero" style={{marginTop:16}}>
      <h2>Disable is enforced in two places</h2>
      <p>The application refuses disabled profiles at login/session checks, and database role helpers return no staff role for disabled profiles, so RLS/RPC authorization also fails.</p>
    </div>
  </>;
}
