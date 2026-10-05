'use client';

import { useEffect,useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ugx } from "@/lib/costing";

export default function WasteCorrections({live,canCorrect}:{live:boolean;canCorrect:boolean}){
  const [rows,setRows]=useState<any[]>([]);
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);

  async function load(){
    if(!live)return;
    const supabase=createClient();
    const {data,error}=await supabase
      .from("waste_events")
      .select("id,waste_type,quantity,reason,total_cost,approval_status,recorded_at,reversed_at,reverse_reason,products(name),raw_materials(name,base_unit)")
      .order("recorded_at",{ascending:false})
      .limit(100);
    if(error){setMessage(error.message);return;}
    setRows(data??[]);
  }
  useEffect(()=>{void load();},[live]);

  async function reverse(row:any){
    if(!canCorrect){setMessage("You do not have correction permission.");return;}
    const why=window.prompt("Why are you reversing this waste record?");
    if(!why?.trim())return;
    if(!window.confirm("Reverse this waste record? Its stock effect will be undone safely."))return;
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {error}=await supabase.rpc("reverse_waste_event",{p_waste_id:row.id,p_reason:why.trim()});
      if(error)throw error;
      setMessage("Waste record reversed and inventory effect corrected.");
      await load();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not reverse waste record.");}
    finally{setBusy(false);}
  }

  async function restore(row:any){
    const why=window.prompt("Why are you restoring this waste record?");
    if(!why?.trim())return;
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {error}=await supabase.rpc("restore_waste_event",{p_waste_id:row.id,p_reason:why.trim()});
      if(error)throw error;
      setMessage("Waste record restored and inventory effect reapplied.");
      await load();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not restore waste record.");}
    finally{setBusy(false);}
  }

  return <div className="card" style={{marginTop:16}}>
    <h2 style={{color:"var(--brown)",marginTop:0}}>Waste Corrections</h2>
    <p style={{color:"var(--muted)"}}>Reversing approved waste returns the affected raw material or finished goods to stock. Pending waste is simply rejected with an audit reason.</p>
    {message&&<div className="hero" style={{padding:12}}><b>{message}</b></div>}
    <div className="tablewrap"><table>
      <thead><tr><th>Date</th><th>Item</th><th>Type</th><th>Quantity</th><th>Cost</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>{rows.length===0?<tr><td colSpan={7}>No waste records found.</td></tr>:rows.map(r=><tr key={r.id}>
        <td>{new Date(r.recorded_at).toLocaleString()}</td>
        <td><b>{r.waste_type==="raw_material"?(r.raw_materials?.name??"—"):(r.products?.name??"—")}</b><br/><small>{r.reason}</small></td>
        <td>{r.waste_type}</td>
        <td>{Number(r.quantity)} {r.waste_type==="raw_material"?(r.raw_materials?.base_unit??""):"pcs"}</td>
        <td>{ugx(Number(r.total_cost||0))}</td>
        <td>{r.reversed_at?<span className="badge red">REVERSED</span>:<span className={r.approval_status==="approved"?"badge green":"badge gold"}>{r.approval_status}</span>}</td>
        <td>{!canCorrect?<span>—</span>:r.reversed_at
          ?<button className="btn primary" disabled={busy} onClick={()=>restore(r)}>Restore</button>
          :r.approval_status==="rejected"?<span>—</span>:<button className="btn secondary" disabled={busy} onClick={()=>reverse(r)}>Reverse / Delete</button>}
        </td>
      </tr>)}</tbody>
    </table></div>
  </div>;
}
