'use client';
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ugx } from "@/lib/costing";

export default function BranchManager({branches,live,canManage}:{branches:any[];live:boolean;canManage:boolean}){
  const router=useRouter();
  const [editing,setEditing]=useState<any|null>(null);
  const [name,setName]=useState("");
  const [code,setCode]=useState("");
  const [address,setAddress]=useState("");
  const [phone,setPhone]=useState("");
  const [active,setActive]=useState(true);
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);

  function reset(){setEditing(null);setName("");setCode("");setAddress("");setPhone("");setActive(true);}
  function edit(row:any){setEditing(row);setName(row.name??"");setCode(row.code??"");setAddress(row.address??"");setPhone(row.phone??"");setActive(Boolean(row.active));setMessage("");}

  async function save(){
    if(!name.trim()||!code.trim()){setMessage("Branch name and code are required.");return;}
    if(!live){setMessage(`Demo mode: branch ${editing?"update":"creation"} simulated.`);return;}
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {error}=await supabase.rpc("save_branch",{
        p_branch_id:editing?.id??null,p_code:code.trim(),p_name:name.trim(),p_address:address.trim()||null,
        p_phone:phone.trim()||null,p_manager_id:editing?.manager_id??null,p_active:active
      });
      if(error)throw error;
      setMessage(editing?"Branch updated.":"Branch created.");reset();router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not save branch.");}
    finally{setBusy(false);}
  }

  return <>
    <div className="pagehead"><div><h1>Branches & Locations</h1><p>One database, separate stock, sales and finance context per location.</p></div></div>
    {message&&<div className="hero" style={{padding:14}}><b>{message}</b></div>}
    {canManage&&<div className="card"><div className="pagehead" style={{marginBottom:8}}><div><h3 style={{margin:0}}>{editing?"Edit Branch":"Add Branch"}</h3></div>{editing&&<button className="btn secondary" onClick={reset}>Cancel Edit</button>}</div>
      <div className="grid2"><div className="field"><label>Code</label><input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="BR02"/></div><div className="field"><label>Name</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="DS Bakery - Branch 2"/></div></div>
      <div className="grid2"><div className="field"><label>Address</label><input value={address} onChange={e=>setAddress(e.target.value)}/></div><div className="field"><label>Phone</label><input value={phone} onChange={e=>setPhone(e.target.value)}/></div></div>
      <label style={{display:"flex",gap:8,alignItems:"center",marginBottom:12}}><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/> Active branch</label>
      <button className="btn primary" disabled={busy} onClick={save}>{busy?"Saving…":editing?"Save Changes":"Add Branch"}</button>
    </div>}
    <div className="tablewrap" style={{marginTop:16}}><table><thead><tr><th>Code</th><th>Branch</th><th>Status</th><th>Staff</th><th>Lifetime Sales</th><th>Open Orders</th><th>Action</th></tr></thead><tbody>{branches.length===0?<tr><td colSpan={7}>No branches found.</td></tr>:branches.map(b=><tr key={b.id}><td><b>{b.code}</b></td><td>{b.name}{b.is_default&&<><br/><small>Default location</small></>}</td><td><span className={b.active?"badge green":"badge red"}>{b.active?"Active":"Inactive"}</span></td><td>{b.active_staff??0}</td><td>{ugx(Number(b.lifetime_sales||0))}</td><td>{b.open_orders??0}</td><td>{canManage?<button className="btn secondary" onClick={()=>edit(b)}>Edit</button>:"—"}</td></tr>)}</tbody></table></div>
  </>;
}
