'use client';

import { useEffect,useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function StockCountCorrections({live,canCorrect}:{live:boolean;canCorrect:boolean}){
  const [rows,setRows]=useState<any[]>([]);
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);

  async function load(){
    if(!live)return;
    const supabase=createClient();
    const {data,error}=await supabase
      .from("inventory_transactions")
      .select("id,raw_material_id,quantity_delta,notes,created_at,reversed_at,reverse_reason,restored_at,restore_reason,raw_materials(name,base_unit)")
      .eq("reference_type","stock_count")
      .eq("tx_type","adjustment")
      .order("created_at",{ascending:false})
      .limit(100);
    if(error){setMessage(error.message);return;}
    setRows(data??[]);
  }
  useEffect(()=>{void load();},[live]);

  async function reverse(row:any){
    if(!canCorrect){setMessage("You do not have correction permission.");return;}
    const why=window.prompt("Why are you reversing this stock count?");
    if(!why?.trim())return;
    if(!window.confirm("Reverse this stock count adjustment? An opposite inventory transaction will be posted."))return;
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {error}=await supabase.rpc("reverse_stock_count_adjustment",{p_transaction_id:row.id,p_reason:why.trim()});
      if(error)throw error;
      setMessage("Stock count reversed with an opposite inventory transaction.");
      await load();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not reverse stock count.");}
    finally{setBusy(false);}
  }

  async function restore(row:any){
    const why=window.prompt("Why are you restoring this stock count?");
    if(!why?.trim())return;
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {error}=await supabase.rpc("restore_stock_count_adjustment",{p_transaction_id:row.id,p_reason:why.trim()});
      if(error)throw error;
      setMessage("Stock count restored with a compensating inventory transaction.");
      await load();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not restore stock count.");}
    finally{setBusy(false);}
  }

  return <div className="card" style={{marginTop:16}}>
    <h2 style={{color:"var(--brown)",marginTop:0}}>Stock Count Corrections</h2>
    <p style={{color:"var(--muted)"}}>Stock counts are never erased. Reverse a wrong count, then enter the correct physical count. This keeps the inventory ledger complete.</p>
    {message&&<div className="hero" style={{padding:12}}><b>{message}</b></div>}
    <div className="tablewrap"><table>
      <thead><tr><th>Date</th><th>Material</th><th>Adjustment</th><th>Reason</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>{rows.length===0?<tr><td colSpan={6}>No stock-count adjustments found.</td></tr>:rows.map(r=><tr key={r.id}>
        <td>{new Date(r.created_at).toLocaleString()}</td>
        <td><b>{r.raw_materials?.name??"—"}</b></td>
        <td>{Number(r.quantity_delta)>0?"+":""}{Number(r.quantity_delta)} {r.raw_materials?.base_unit??""}</td>
        <td>{r.notes??"—"}</td>
        <td>{r.reversed_at?<span className="badge red">REVERSED</span>:r.restored_at?<span className="badge gold">RESTORED</span>:<span className="badge green">ACTIVE</span>}</td>
        <td>{!canCorrect?<span>—</span>:r.reversed_at
          ?<button className="btn primary" disabled={busy} onClick={()=>restore(r)}>Restore</button>
          :<button className="btn secondary" disabled={busy} onClick={()=>reverse(r)}>Reverse / Delete</button>}
        </td>
      </tr>)}</tbody>
    </table></div>
  </div>;
}
