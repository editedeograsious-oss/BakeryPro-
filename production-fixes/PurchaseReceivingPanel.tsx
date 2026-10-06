'use client';

import { useMemo,useRef,useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ugx } from "@/lib/costing";

export default function PurchaseReceivingPanel({lines,history=[],live}:{lines:any[];history?:any[];live:boolean}){
  const router=useRouter();
  const [quantities,setQuantities]=useState<Record<string,number>>({});
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const requests=useRef<Record<string,string>>({});

  const totalOrdered=useMemo(()=>history.reduce((s:number,l:any)=>s+Number(l.ordered_qty_base||0),0),[history]);
  const totalReceived=useMemo(()=>history.reduce((s:number,l:any)=>s+Number(l.received_qty_base||0),0),[history]);
  const totalRemaining=useMemo(()=>history.reduce((s:number,l:any)=>s+Number(l.remaining_qty_base||0),0),[history]);

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
      setMessage(`Stock receipt posted: ${data}`);
      delete requests.current[line.id];
      setQuantities(prev=>({...prev,[line.id]:0}));
      router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not receive stock.");}
    finally{setBusy(false);}
  }

  return <>
    <div className="pagehead">
      <div><h1>Purchase Receiving</h1><p>Receive approved supplier deliveries and keep completed purchase receipt history visible.</p></div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <a className="btn secondary" href="/purchase-orders">Purchase Orders</a>
        <a className="btn secondary" href="/supplier-accounts">Supplier Accounts</a>
      </div>
    </div>

    {message&&<div className="hero" style={{padding:14}}><b>{message}</b></div>}

    <div className="grid4">
      <div className="card stat"><div className="label">Awaiting Lines</div><div className="value">{lines.length}</div></div>
      <div className="card stat"><div className="label">Ordered Qty</div><div className="value">{totalOrdered.toLocaleString()}</div></div>
      <div className="card stat"><div className="label">Received Qty</div><div className="value">{totalReceived.toLocaleString()}</div></div>
      <div className="card stat"><div className="label">Remaining Qty</div><div className="value">{totalRemaining.toLocaleString()}</div></div>
    </div>

    <div className="card" style={{marginTop:16}}>
      <h3 style={{color:"var(--brown)",marginTop:0}}>Awaiting Receipt</h3>
      <div className="tablewrap"><table><thead><tr><th>PO</th><th>Supplier</th><th>Material</th><th>Ordered</th><th>Received</th><th>Remaining</th><th>Unit Cost</th><th>Receive</th></tr></thead>
        <tbody>{lines.length===0?<tr><td colSpan={8}>No approved purchase lines awaiting receipt.</td></tr>:lines.map(l=><tr key={l.id}>
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
      <h3 style={{color:"var(--brown)",marginTop:0}}>Purchase Receipt History</h3>
      <p style={{color:"var(--muted)"}}>Fully received purchases remain visible here instead of disappearing when their remaining quantity reaches zero.</p>
      <div className="tablewrap"><table>
        <thead><tr><th>PO</th><th>Supplier</th><th>Material</th><th>Ordered</th><th>Received</th><th>Remaining</th><th>Line Value</th><th>Status</th></tr></thead>
        <tbody>{history.length===0?<tr><td colSpan={8}>No purchase receipt history found.</td></tr>:history.map(l=><tr key={l.id}>
          <td><b>{l.purchase_no}</b></td><td>{l.supplier_name}</td><td>{l.material_name}</td>
          <td>{Number(l.ordered_qty_base).toLocaleString()} {l.base_unit}</td>
          <td>{Number(l.received_qty_base).toLocaleString()} {l.base_unit}</td>
          <td>{Number(l.remaining_qty_base).toLocaleString()} {l.base_unit}</td>
          <td>{ugx(Number(l.line_total||0))}</td>
          <td>{Number(l.remaining_qty_base||0)===0?<span className="badge green">RECEIVED</span>:Number(l.received_qty_base||0)>0?<span className="badge gold">PARTIAL</span>:<span className="badge">AWAITING</span>}</td>
        </tr>)}</tbody>
      </table></div>
    </div>

    <div className="hero" style={{marginTop:16}}><h2>Stock control</h2><p>Each receipt posts an inventory transaction. Network retries use a client request ID so the same delivery is not posted twice.</p></div>
  </>;
}
