'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const ROLES=["manager","cashier","baker","storekeeper"] as const;
const ROLE_LABELS:Record<string,string>={
  owner:"CEO / Owner",
  manager:"General Manager / Admin",
  baker:"Head Baker",
  storekeeper:"Stock Manager",
  cashier:"Sales Team / Cashier"
};

export default function StaffAdminManager({staff,live}:{staff:any[];live:boolean}){
  const router=useRouter();
  const [email,setEmail]=useState("");
  const [name,setName]=useState("");
  const [role,setRole]=useState("cashier");
  const [initialPassword,setInitialPassword]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const [accessStaff,setAccessStaff]=useState<any|null>(null);
  const [permissions,setPermissions]=useState<any[]>([]);
  const [accessBusy,setAccessBusy]=useState(false);

  async function ownerSession(){
    const supabase=createClient();
    const {data:{session},error}=await supabase.auth.getSession();
    if(error||!session?.access_token)throw new Error("Your secure session has expired. Sign in again and retry.");
    return {supabase,session};
  }

  async function createStaff(){
    if(!email.trim()||!name.trim()){setMessage("Email and staff name are required.");return;}
    if(initialPassword.length<10){setMessage("Initial password must be at least 10 characters.");return;}
    if(!live){setMessage("Demo mode: staff account creation simulated.");return;}

    setBusy(true);setMessage("");
    try{
      const {session}=await ownerSession();
      const res=await fetch("/api/staff/create",{
        method:"POST",
        headers:{
          "content-type":"application/json",
          "authorization":`Bearer ${session.access_token}`,
        },
        body:JSON.stringify({
          email:email.trim(),
          full_name:name.trim(),
          role,
          initial_password:initialPassword,
        }),
      });
      const body=await res.json();
      if(!res.ok)throw new Error(body?.error??"Could not create staff account.");
      setMessage("Staff account created. They can sign in immediately with the email and initial password. Use Manage Access to adjust what they can open.");
      setEmail("");setName("");setRole("cashier");setInitialPassword("");
      router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not create staff account.");}
    finally{setBusy(false);}
  }

  async function toggle(row:any){
    if(row.role==="owner"){setMessage("CEO / Owner account is protected.");return;}
    const action=row.active?"disable":"re-enable";
    if(!window.confirm(`${action.charAt(0).toUpperCase()+action.slice(1)} ${row.full_name}? ${row.active?"They will lose access until re-enabled.":"They will regain access according to their role and access overrides."}`))return;
    if(!live){setMessage("Demo mode: staff status change simulated.");return;}
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {error}=await supabase.rpc("set_staff_active",{p_staff_id:row.id,p_active:!row.active});
      if(error)throw error;
      setMessage(row.active?"Staff account disabled.":"Staff account re-enabled.");
      if(accessStaff?.id===row.id)setAccessStaff({...row,active:!row.active});
      router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not change staff status.");}
    finally{setBusy(false);}
  }

  async function changeRole(id:string,next:string){
    if(!window.confirm(`Change this staff member to ${ROLE_LABELS[next]??next}? Their default access permissions will change immediately.`))return;
    if(!live){setMessage(`Demo mode: role would change to ${ROLE_LABELS[next]??next}.`);return;}
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {error}=await supabase.rpc("change_staff_role",{p_staff_id:id,p_role:next});
      if(error)throw error;
      setMessage("Staff role changed. Individual access overrides remain in effect.");
      router.refresh();
      if(accessStaff?.id===id){
        const updated={...accessStaff,role:next};
        setAccessStaff(updated);
        await loadAccess(updated);
      }
    }catch(e){setMessage(e instanceof Error?e.message:"Could not change role.");}
    finally{setBusy(false);}
  }

  async function loadAccess(row:any){
    if(row.role==="owner"){setMessage("CEO / Owner access is protected and cannot be edited here.");return;}
    setAccessStaff(row);
    setAccessBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {data,error}=await supabase.rpc("effective_staff_permissions",{p_staff_id:row.id});
      if(error)throw error;
      setPermissions(data??[]);
    }catch(e){
      setPermissions([]);
      setMessage(e instanceof Error?e.message:"Could not load staff access.");
    }finally{setAccessBusy(false);}
  }

  async function changeAccess(permission:any,mode:string){
    if(!accessStaff)return;
    if(!live){setMessage("Demo mode: access change simulated.");return;}
    setAccessBusy(true);setMessage("");
    try{
      const supabase=createClient();
      if(mode==="default"){
        const {error}=await supabase.rpc("clear_staff_permission_override",{
          p_staff_id:accessStaff.id,
          p_permission_key:permission.permission_key
        });
        if(error)throw error;
      }else{
        const {error}=await supabase.rpc("set_staff_permission_override",{
          p_staff_id:accessStaff.id,
          p_permission_key:permission.permission_key,
          p_allowed:mode==="allow",
          p_reason:"Owner access configuration from Staff & Roles"
        });
        if(error)throw error;
      }
      const {data,error}=await supabase.rpc("effective_staff_permissions",{p_staff_id:accessStaff.id});
      if(error)throw error;
      setPermissions(data??[]);
      setMessage(`Access updated for ${accessStaff.full_name}.`);
    }catch(e){setMessage(e instanceof Error?e.message:"Could not update staff access.");}
    finally{setAccessBusy(false);}
  }

  return <>
    <div className="pagehead">
      <div><h1>Staff & Access</h1><p>CEO / Owner-controlled staff accounts, roles, permissions and account status.</p></div>
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
      <h3 style={{color:"var(--brown)",marginTop:0}}>Create Staff Account</h3>
      <p style={{color:"var(--muted)"}}>Create the login directly. The CEO / Owner chooses the role and can customize access afterward.</p>
      <div className="grid2">
        <div className="field"><label>Full name</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="Staff member name"/></div>
        <div className="field"><label>Email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="staff@example.com"/></div>
      </div>
      <div className="grid2">
        <div className="field"><label>Role</label><select value={role} onChange={e=>setRole(e.target.value)}>{ROLES.map(r=><option key={r} value={r}>{ROLE_LABELS[r]??r}</option>)}</select></div>
        <div className="field"><label>Initial password</label><input type="password" autoComplete="new-password" value={initialPassword} onChange={e=>setInitialPassword(e.target.value)} placeholder="At least 10 characters"/></div>
      </div>
      <button className="btn primary" disabled={busy} onClick={createStaff}>{busy?"Creating…":"Create Staff Account"}</button>
      <p style={{color:"var(--muted)",fontSize:12}}>The initial password is sent only to Supabase Auth and is not stored in DS Bakery records or audit logs. Do not reuse your Owner password.</p>
    </div>

    <div className="tablewrap" style={{marginTop:16}}>
      <table><thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Last Sign-In</th><th>Role Change</th><th>Access</th><th>Account</th></tr></thead>
      <tbody>{staff.map(s=><tr key={s.id}>
        <td><b>{s.full_name}</b></td>
        <td>{ROLE_LABELS[s.role]??s.role}</td>
        <td><span className={s.active?"badge green":"badge red"}>{s.active?"Active":"Disabled"}</span></td>
        <td>{s.last_sign_in_at?new Date(s.last_sign_in_at).toLocaleString():"—"}</td>
        <td>{s.role==="owner"?<span style={{color:"var(--muted)"}}>Protected</span>:<select disabled={busy} value={s.role} onChange={e=>changeRole(s.id,e.target.value)}>{ROLES.map(r=><option key={r} value={r}>{ROLE_LABELS[r]??r}</option>)}</select>}</td>
        <td>{s.role==="owner"?<span style={{color:"var(--muted)"}}>Full Owner Access</span>:<button className="btn secondary" disabled={busy} onClick={()=>loadAccess(s)}>Manage Access</button>}</td>
        <td>{s.role==="owner"?<span style={{color:"var(--muted)"}}>Protected CEO / Owner</span>:<button className={s.active?"btn secondary":"btn primary"} disabled={busy} onClick={()=>toggle(s)}>{s.active?"Disable":"Re-enable"}</button>}</td>
      </tr>)}</tbody></table>
    </div>

    {accessStaff&&<div className="card" style={{marginTop:16}}>
      <div className="pagehead" style={{marginBottom:8}}>
        <div>
          <h2 style={{margin:0}}>Manage Access — {accessStaff.full_name}</h2>
          <p style={{marginTop:6}}>Role: {ROLE_LABELS[accessStaff.role]??accessStaff.role}. Choose Role Default, Allow, or Block for each permission.</p>
        </div>
        <button className="btn secondary" onClick={()=>{setAccessStaff(null);setPermissions([]);}}>Close</button>
      </div>
      {accessBusy&&<p>Loading access…</p>}
      {!accessBusy&&<div className="tablewrap">
        <table>
          <thead><tr><th>Permission</th><th>Description</th><th>Role Default</th><th>Effective</th><th>Owner Override</th></tr></thead>
          <tbody>{permissions.map(p=><tr key={p.permission_key}>
            <td><b>{p.permission_key}</b>{p.critical&&<div><span className="badge red">Critical</span></div>}</td>
            <td>{p.description}</td>
            <td><span className={p.role_default?"badge green":"badge red"}>{p.role_default?"Allowed":"Blocked"}</span></td>
            <td><span className={p.effective_allowed?"badge green":"badge red"}>{p.effective_allowed?"Allowed":"Blocked"}</span></td>
            <td>
              <select disabled={accessBusy||!accessStaff.active}
                value={p.has_override?(p.individual_override?"allow":"block"):"default"}
                onChange={e=>changeAccess(p,e.target.value)}>
                <option value="default">Use Role Default</option>
                <option value="allow">Allow</option>
                <option value="block">Block</option>
              </select>
            </td>
          </tr>)}</tbody>
        </table>
      </div>}
      {!accessStaff.active&&<p style={{color:"var(--muted)"}}>This account is disabled. Re-enable it before changing access.</p>}
    </div>}

    <div className="hero" style={{marginTop:16}}>
      <h2>Owner remains protected</h2>
      <p>Staff can be given only the access they need. The CEO / Owner role cannot be assigned, edited or disabled from this screen. Every role change, permission override and account-status change is audited.</p>
    </div>
  </>;
}
