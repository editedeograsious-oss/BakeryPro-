'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const ROLES=["manager","cashier","baker","storekeeper","viewer"] as const;
const ROLE_LABELS:Record<string,string>={owner:"CEO / Owner",manager:"General Manager",baker:"Head Baker",storekeeper:"Stock Manager",cashier:"Sales Team",viewer:"View-Only Staff"};

export default function StaffAdminManager({staff,live}:{staff:any[];live:boolean}){
  const router=useRouter();
  const [email,setEmail]=useState("");
  const [name,setName]=useState("");
  const [role,setRole]=useState("cashier");
  const [initialPassword,setInitialPassword]=useState("");
  const [confirmPassword,setConfirmPassword]=useState("");
  const [showPassword,setShowPassword]=useState(false);
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);

  async function createStaff(){
    const staffName=name.trim();
    const staffEmail=email.trim().toLowerCase();
    if(!staffName || !staffEmail || !staffEmail.includes("@")){
      setMessage("Enter the staff member's full name and valid email address."); return;
    }
    if(!ROLES.includes(role as any)){
      setMessage("Choose a permitted staff role."); return;
    }
    if(initialPassword.length < 12){
      setMessage("Set an initial password of at least 12 characters."); return;
    }
    if(initialPassword !== confirmPassword){
      setMessage("The two passwords do not match."); return;
    }
    if(!live){setMessage("Demo mode: a real account cannot be created.");return;}
    if(busy)return;
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {data:{session},error:sessionError}=await supabase.auth.getSession();
      if(sessionError || !session) throw new Error("Sign in as CEO / Owner again to create staff.");
      const response=await fetch("/api/staff/create",{
        method:"POST",
        headers:{"content-type":"application/json","authorization":`Bearer ${session.access_token}`},
        body:JSON.stringify({email:staffEmail,full_name:staffName,role,initial_password:initialPassword}),
        cache:"no-store",
      });
      const payload=await response.json().catch(()=>({}));
      if(response.status===404)throw new Error("The staff account creation service has not yet been installed in staging. Contact the bakery administrator.");
      if(!response.ok)throw new Error(payload.error??"Could not create staff account. Check that the staff-account service is configured.");
      if(payload.ok!==true || typeof payload.user_id!=="string")throw new Error("Account service did not confirm a new staff login.");
      // A success response is not enough. Verify the authenticated CEO can see
      // the staff profile in the same STAGING database as the login form.
      const {data:profile,error:verifyError}=await supabase.from("profiles")
        .select("id,role,active").eq("id",payload.user_id).maybeSingle();
      if(verifyError || !profile || profile.role!==role || !profile.active){
        setInitialPassword("");setConfirmPassword("");
        throw new Error("Login creation was submitted, but the staff profile could not be verified. Do not create a duplicate; refresh Staff & Roles and contact the administrator.");
      }
      setInitialPassword("");setConfirmPassword("");setName("");setEmail("");setRole("cashier");
      setMessage(`STAGING staff account verified for ${staffName}. They can now sign in at this Staging website using their email and initial password. They must replace their temporary password on first login.`);
      router.refresh();
    }catch(err){
      setMessage(err instanceof Error?err.message:"Could not create staff account.");
    }finally{
      setBusy(false);
    }
  }

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
    }catch(e){setMessage(e&&typeof e==="object"&&"message" in e?String(e.message):"Could not invite staff member.");}
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
    }catch(e){setMessage(e&&typeof e==="object"&&"message" in e?String(e.message):"Could not change staff status.");}
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
    }catch(e){setMessage(e&&typeof e==="object"&&"message" in e?String(e.message):"Could not change role.");}
    finally{setBusy(false);}
  }

  return <>
    <div className="pagehead">
      <div><h1>Staff & Roles</h1><p>CEO / Owner can add staff members individually, set their initial login passwords and manage access. <strong>Accounts created here belong to this STAGING environment only.</strong></p></div>
      <span className="badge red">CEO / Owner Only</span>
    </div>
    {message&&<div className="hero" style={{padding:14}}><b>{message}</b></div>}

    <div className="grid4">
      <div className="card stat"><div className="label">Active Staff</div><div className="value">{staff.filter(s=>s.active).length}</div></div>
      <div className="card stat"><div className="label">Disabled</div><div className="value">{staff.filter(s=>!s.active).length}</div></div>
      <div className="card stat"><div className="label">Roles</div><div className="value">6</div></div>
      <div className="card stat"><div className="label">CEO / Owner Accounts</div><div className="value">{staff.filter(s=>s.role==="owner").length}</div></div>
    </div>

    <div className="card" style={{marginTop:16}}>
      <h3 style={{color:"var(--brown)",marginTop:0}}>Add Staff Account — One Person at a Time</h3>
      <p style={{color:"var(--muted)",marginTop:0}}>CEO / Owner sets the staff member's name, email, job role and first login password. The password is not included in the staff list or activity logs.</p>
      <div className="grid2">
        <div className="field"><label>Full name</label><input value={name} onChange={e=>setName(e.target.value)}/></div>
        <div className="field"><label>Email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)}/></div>
      </div>
      <div className="field"><label>Role</label><select value={role} onChange={e=>setRole(e.target.value)}>{ROLES.map(r=><option key={r} value={r}>{ROLE_LABELS[r]??r}</option>)}</select></div>
      <div className="grid2" style={{marginTop:12}}>
        <div className="field"><label htmlFor="staff-initial-password">Initial password (12+ characters)</label><input id="staff-initial-password" autoComplete="new-password" type={showPassword?"text":"password"} value={initialPassword} onChange={e=>setInitialPassword(e.target.value)} placeholder="Create a unique password" minLength={12}/></div>
        <div className="field"><label htmlFor="staff-confirm-password">Confirm initial password</label><input id="staff-confirm-password" autoComplete="new-password" type={showPassword?"text":"password"} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="Repeat password" minLength={12}/></div>
      </div>
      <label style={{display:"flex",gap:8,alignItems:"center",marginBottom:12}}><input type="checkbox" checked={showPassword} onChange={e=>setShowPassword(e.target.checked)}/> Show password while entering</label>
      <div className="action-row">
        <button className="btn primary" disabled={busy} onClick={createStaff}>{busy?"Creating…":"Create Staff Account"}</button>
        <button className="btn secondary" disabled={busy} onClick={invite}>Send Email Invitation Instead</button>
      </div>
      <p style={{color:"var(--muted)",fontSize:12}}>Create each administrator separately. Select their role to give only the appropriate permissions. The initial password is sent securely to the staff creation service and never stored in this page's database records. The staff member must choose a new password at first sign-in before accessing any business records.</p>
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
