'use client';

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ugx } from "@/lib/costing";

export default function PurchaseReceivingPanel({lines,live}:{lines:any[];live:boolean}){
  const router=useRouter();
  const [quantities,setQuantities]=useState<Record<string,number>>({});
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const requests=useRef<Record<string,string>>({});

  const waiting=lines.filter(l=>Number(l.remaining_qty_base||0)>0);
  const complete=lines.filter(l=>Number(l.remaining_qty_base||0)<=0);

  async function receive(line:any){
    const qty=Number(quantities[line.id]??0);
    if(qty<=0){setMessage("Enter a positive received quantity.");return;}
    if(qty>Number(line.remaining_qty_base)){setMessage("Received quantity cannot exceed the remaining ordered quantity.");return;}
    if(!live){setMessage("Demo mode: stock receipt simulated.");return;}

    const requestId=requests.current[line.id]??crypto.randomUUID();
    requests.current[line.id]=requestId;

    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {data,error}=await supabase.rpc("receive_purchase_item",{
        p_purchase_item_id:line.id,
        p_receive_qty_base:qty,
        p_client_request_id:requestId,
      });
      if(error)throw error;
      setMessage(`Stock receipt posted • ${data}`);
      delete requests.current[line.id];
      setQuantities(prev=>({...prev,[line.id]:0}));
      router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not receive stock.");}
    finally{setBusy(false);}
  }

  function table(rows:any[],history=false){
    return <div className="tablewrap"><table>
      <thead><tr><th>PO</th><th>Supplier</th><th>Material</th><th>Ordered</th><th>Received</th><th>Remaining</th><th>Unit Cost</th><th>{history?"Status":"Receive"}</th></tr></thead>
      <tbody>{rows.length===0?<tr><td colSpan={8}>{history?"No completed receipt lines yet.":"No approved purchase lines awaiting receipt."}</td></tr>:rows.map(l=><tr key={l.id}>
        <td><b>{l.purchase_no}</b></td>
        <td>{l.supplier_name}</td>
        <td>{l.material_name}</td>
        <td>{Number(l.ordered_qty_base).toLocaleString()} {l.base_unit}</td>
        <td>{Number(l.received_qty_base).toLocaleString()} {l.base_unit}</td>
        <td><b>{Number(l.remaining_qty_base).toLocaleString()} {l.base_unit}</b></td>
        <td>{ugx(Number(l.unit_cost_base))}/{l.base_unit}</td>
        <td>{history
          ?<span className="badge green">FULLY RECEIVED</span>
          :<div style={{display:"flex",gap:6,minWidth:190}}><input type="number" min="0.000001" step="any" style={{maxWidth:105}} value={quantities[l.id]??0} onChange={e=>setQuantities(prev=>({...prev,[l.id]:Number(e.target.value)}))}/><button className="btn primary" disabled={busy} onClick={()=>receive(l)}>Receive</button></div>}
        </td>
      </tr>)}</tbody>
    </table></div>;
  }

  return <>
    <div className="pagehead"><div><h1>Purchase Receiving</h1><p>Approved purchase lines increase raw-material stock only when goods are actually received.</p></div></div>
    {message&&<div className="hero" style={{padding:14}}><b>{message}</b></div>}

    <div className="grid4">
      <div className="card stat"><div className="label">Purchase Lines</div><div className="value">{lines.length}</div></div>
      <div className="card stat"><div className="label">Awaiting Receipt</div><div className="value">{waiting.length}</div></div>
      <div className="card stat"><div className="label">Fully Received</div><div className="value">{complete.length}</div></div>
      <div className="card stat"><div className="label">Stock Rule</div><div className="value" style={{fontSize:18}}>Receipt Only</div></div>
    </div>

    <div className="card" style={{marginTop:16}}>
      <h3 style={{color:"var(--brown)",marginTop:0}}>Awaiting Receipt</h3>
      {table(waiting,false)}
    </div>

    <div className="card" style={{marginTop:16}}>
      <h3 style={{color:"var(--brown)",marginTop:0}}>Recently Fully Received</h3>
      <p style={{color:"var(--muted)"}}>Completed lines remain visible here so received purchases do not appear to disappear.</p>
      {table(complete.slice(0,100),true)}
    </div>
  </>;
}
