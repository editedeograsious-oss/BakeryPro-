'use client';

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ugx } from "@/lib/costing";

export default function PurchaseReceivingPanel({lines,history,live}:{lines:any[];history:any[];live:boolean}){
  const router=useRouter();
  const [quantities,setQuantities]=useState<Record<string,number>>({});
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const requests=useRef<Record<string,string>>({});

  const fullyReceived=history.filter((x:any)=>Number(x.remaining_qty_base||0)<=0).length;
  const historyValue=history.reduce((s:number,x:any)=>s+Number(x.line_total||0),0);
  const receivedValue=history.reduce((s:number,x:any)=>s+Number(x.received_qty_base||0)*Number(x.unit_cost_base||0),0);

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

  return <>
    <div className="pagehead"><div><h1>Purchases & Receiving</h1><p>Receive approved supplier orders and keep completed receipt history visible.</p></div></div>
    {message&&<div className="hero" style={{padding:14}}><b>{message}</b></div>}

    <div className="grid4">
      <div className="card stat"><div className="label">Open Receipt Lines</div><div className="value">{lines.length}</div></div>
      <div className="card stat"><div className="label">Fully Received Lines</div><div className="value">{fullyReceived}</div></div>
      <div className="card stat"><div className="label">Purchase Line Value</div><div className="value">{ugx(historyValue)}</div></div>
      <div className="card stat"><div className="label">Value Received</div><div className="value">{ugx(receivedValue)}</div></div>
    </div>

    <div className="card" style={{marginTop:16}}>
      <h2 style={{color:"var(--brown)",marginTop:0}}>Awaiting Receipt</h2>
      <p style={{color:"var(--muted)"}}>Only approved purchase-order lines with quantity still outstanding appear here.</p>
      <div className="tablewrap"><table><thead><tr><th>PO</th><th>Supplier</th><th>Material</th><th>Ordered</th><th>Received</th><th>Remaining</th><th>Unit Cost</th><th>Receive</th></tr></thead>
        <tbody>{lines.length===0?<tr><td colSpan={8}>No approved purchase lines are waiting for receipt.</td></tr>:lines.map(l=><tr key={l.id}>
          <td><b>{l.purchase_no}</b></td><td>{l.supplier_name}</td><td>{l.material_name}</td>
          <td>{Number(l.ordered_qty_base).toLocaleString()} {l.base_unit}</td>
          <td>{Number(l.received_qty_base).toLocaleString()} {l.base_unit}</td>
          <td><b>{Number(l.remaining_qty_base).toLocaleString()} {l.base_unit}</b></td>
          <td>{ugx(Number(l.unit_cost_base))}/{l.base_unit}</td>
          <td><div style={{display:"flex",gap:6,minWidth:190}}><input type="number" min="0.000001" step="any" style={{maxWidth:105}} value={quantities[l.id]??0} onChange={e=>setQuantities(prev=>({...prev,[l.id]:Number(e.target.value)}))}/><button className="btn primary" disabled={busy} onClick={()=>receive(l)}>Receive</button></div></td>
        </tr>)}</tbody>
      </table></div>
    </div>

    <div className="card" style={{marginTop:16}}>
      <h2 style={{color:"var(--brown)",marginTop:0}}>Receiving History</h2>
      <p style={{color:"var(--muted)"}}>Completed purchase lines stay visible here after they leave the receiving queue.</p>
      <div className="tablewrap"><table>
        <thead><tr><th>PO</th><th>Date</th><th>Supplier</th><th>Material</th><th>Ordered</th><th>Received</th><th>Remaining</th><th>Line Value</th><th>Status</th></tr></thead>
        <tbody>{history.length===0?<tr><td colSpan={9}>No purchase receiving history found.</td></tr>:history.map((l:any)=><tr key={l.id}>
          <td><b>{l.purchase_no}</b></td><td>{l.purchase_date}</td><td>{l.supplier_name}</td><td>{l.material_name}</td>
          <td>{Number(l.ordered_qty_base||0).toLocaleString()} {l.base_unit}</td>
          <td><b>{Number(l.received_qty_base||0).toLocaleString()} {l.base_unit}</b></td>
          <td>{Number(l.remaining_qty_base||0).toLocaleString()} {l.base_unit}</td>
          <td>{ugx(Number(l.line_total||0))}</td>
          <td>{Number(l.remaining_qty_base||0)<=0?<span className="badge green">RECEIVED</span>:<span className="badge gold">PARTIAL / OPEN</span>}</td>
        </tr>)}</tbody>
      </table></div>
    </div>

    <div className="hero" style={{marginTop:16}}><h2>Receiving protects stock accuracy</h2><p>Approval alone does not increase inventory. Stock changes only when an approved receipt is posted, and completed receipts remain visible in the history table.</p></div>
  </>;
}
