'use client';
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ugx } from "@/lib/costing";

function localDateTime(value:any){if(!value)return "";const d=new Date(value);const pad=(n:number)=>String(n).padStart(2,"0");return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;}

export default function PromotionManager({promotions,live}:{promotions:any[];live:boolean}){
  const router=useRouter();
  const [editing,setEditing]=useState<any|null>(null);
  const [name,setName]=useState("");const [code,setCode]=useState("");
  const [discountType,setDiscountType]=useState("percent");const [value,setValue]=useState(10);
  const [minimum,setMinimum]=useState(0);const [maximum,setMaximum]=useState(0);const [usageLimit,setUsageLimit]=useState(0);
  const [startsAt,setStartsAt]=useState(localDateTime(new Date()));
  const [endsAt,setEndsAt]=useState(localDateTime(new Date(Date.now()+30*86400000)));
  const [active,setActive]=useState(true);const [message,setMessage]=useState("");const [busy,setBusy]=useState(false);

  function reset(){setEditing(null);setName("");setCode("");setDiscountType("percent");setValue(10);setMinimum(0);setMaximum(0);setUsageLimit(0);setStartsAt(localDateTime(new Date()));setEndsAt(localDateTime(new Date(Date.now()+30*86400000)));setActive(true);}
  function edit(p:any){setEditing(p);setName(p.name??"");setCode(p.code??"");setDiscountType(p.discount_type??"percent");setValue(Number(p.discount_value??0));setMinimum(Number(p.minimum_order??0));setMaximum(Number(p.maximum_discount??0));setUsageLimit(Number(p.usage_limit??0));setStartsAt(localDateTime(p.starts_at));setEndsAt(localDateTime(p.ends_at));setActive(Boolean(p.active));setMessage("");}

  async function save(){
    if(!name.trim()||!code.trim()){setMessage("Promotion name and code are required.");return;}
    if(value<=0||(discountType==="percent"&&value>100)){setMessage("Enter a valid discount value.");return;}
    if(!startsAt||!endsAt||new Date(endsAt)<=new Date(startsAt)){setMessage("Promotion end must be after its start.");return;}
    if(!live){setMessage(`Demo mode: promotion ${editing?"update":"creation"} simulated.`);return;}
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {error}=await supabase.rpc("save_promotion",{
        p_id:editing?.id??null,p_code:code.trim().toUpperCase(),p_name:name.trim(),p_discount_type:discountType,
        p_discount_value:value,p_minimum_order:minimum,p_maximum_discount:maximum>0?maximum:null,
        p_starts_at:new Date(startsAt).toISOString(),p_ends_at:new Date(endsAt).toISOString(),p_usage_limit:usageLimit>0?usageLimit:null,
        p_allow_below_cost:false,p_active:active,p_product_ids:null
      });
      if(error)throw error;
      setMessage(editing?"Promotion updated.":"Promotion created.");reset();router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not save promotion.");}
    finally{setBusy(false);}
  }

  return <>
    <div className="pagehead"><div><h1>Promotions</h1><p>Controlled discounts with expiry, limits and audit-friendly management.</p></div></div>
    {message&&<div className="hero" style={{padding:14}}><b>{message}</b></div>}
    <div className="card"><div className="pagehead" style={{marginBottom:8}}><div><h3 style={{margin:0}}>{editing?"Edit Promotion":"New Promotion"}</h3></div>{editing&&<button className="btn secondary" onClick={reset}>Cancel Edit</button>}</div>
      <div className="grid2"><div className="field"><label>Name</label><input value={name} onChange={e=>setName(e.target.value)}/></div><div className="field"><label>Promo Code</label><input value={code} onChange={e=>setCode(e.target.value.toUpperCase())}/></div></div>
      <div className="grid2"><div className="field"><label>Discount type</label><select value={discountType} onChange={e=>setDiscountType(e.target.value)}><option value="percent">Percent</option><option value="fixed">Fixed UGX</option></select></div><div className="field"><label>Discount value</label><input type="number" min="0.01" value={value} onChange={e=>setValue(Number(e.target.value))}/></div></div>
      <div className="grid2"><div className="field"><label>Minimum order (UGX)</label><input type="number" min="0" value={minimum} onChange={e=>setMinimum(Number(e.target.value))}/></div><div className="field"><label>Maximum discount (0 = no cap)</label><input type="number" min="0" value={maximum} onChange={e=>setMaximum(Number(e.target.value))}/></div></div>
      <div className="grid2"><div className="field"><label>Starts</label><input type="datetime-local" value={startsAt} onChange={e=>setStartsAt(e.target.value)}/></div><div className="field"><label>Ends</label><input type="datetime-local" value={endsAt} onChange={e=>setEndsAt(e.target.value)}/></div></div>
      <div className="field"><label>Usage limit (0 = unlimited)</label><input type="number" min="0" value={usageLimit} onChange={e=>setUsageLimit(Number(e.target.value))}/></div>
      <label style={{display:"flex",gap:8,alignItems:"center",marginBottom:12}}><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/> Active</label>
      <button className="btn primary" disabled={busy} onClick={save}>{busy?"Saving…":editing?"Save Changes":"Create Promotion"}</button>
    </div>
    <div className="tablewrap" style={{marginTop:16}}><table><thead><tr><th>Name</th><th>Code</th><th>Discount</th><th>Minimum</th><th>Window</th><th>Status</th><th>Action</th></tr></thead><tbody>{promotions.length===0?<tr><td colSpan={7}>No promotions yet.</td></tr>:promotions.map(p=><tr key={p.id}><td><b>{p.name}</b></td><td>{p.code??"—"}</td><td>{p.discount_type==="percent"?`${p.discount_value}%`:ugx(Number(p.discount_value))}</td><td>{ugx(Number(p.minimum_order||0))}</td><td>{new Date(p.starts_at).toLocaleDateString()} – {new Date(p.ends_at).toLocaleDateString()}</td><td><span className={p.active?"badge green":"badge red"}>{p.active?"Active":"Inactive"}</span></td><td><button className="btn secondary" onClick={()=>edit(p)}>Edit</button></td></tr>)}</tbody></table></div>
  </>;
}
