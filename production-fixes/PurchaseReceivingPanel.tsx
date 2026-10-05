'use client';

import { useMemo,useRef,useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ugx } from "@/lib/costing";

export default function PurchaseReceivingPanel({lines,live}:{lines:any[];live:boolean}){
  const router=useRouter();
  const [quantities,setQuantities]=useState<Record<string,number>>({});
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const requests=useRef<Record<string,string>>({});

  const openLines=lines.filter(l=>Number(l.remaining_qty_base||0)>0);
  const completedLines=lines.filter(l=>Number(l.remaining_qty_base||0)<=0);
  const ordered=useMemo(()=>lines.reduce((s,l)=>s+Number(l.ordered_qty_base||0),0),[lines]);
  const received=useMemo(()=>lines.reduce((s,l)=>s+Number(l.received_qty_base||0),0),[lines]);
  const remaining=useMemo(()=>lines.reduce((s,l)=>s+Number(l.remaining_qty_base||0),0),[lines]);
  const value=useMemo(()=>lines.reduce((s,l)=>s+Number(l.line_total||0),0),[lines]);

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

  function rows(items:any[],allowReceive:boolean){
    return <div className="tablewrap"><table>
      <thead><tr><th>PO</th><th>Supplier</th><th>Material</th><th>Ordered</th><th>Received</th><th>Remaining</th><th>Unit Cost</th><th>Line Value</th>{allowReceive&&<th>Receive</th>}</tr></thead>
      <tbody>{items.length===0?<tr><td colSpan={allowReceive?9:8}>{allowReceive?"No approved purchase lines awaiting receipt.":"No completed receiving history yet."}</td></tr>:items.map(l=><tr key={l.id}>
        <td><b>{l.purchase_no}</b><br/><span style={{fontSize:12,color:"var(--muted)"}}>{l.purchase_date}</span></td>
        <td>{l.supplier_name}</td>
        <td>{l.material_name}</td>
        <td>{Number(l.ordered_qty_base).toLocaleString()} {l.base_unit}</td>
        <td><b>{Number(l.received_qty_base).toLocaleString()} {l.base_unit}</b></td>
        <td>{Number(l.remaining_qty_base)>0?<span className="badge gold">{Number(l.remaining_qty_base).toLocaleString()} {l.base_unit}</span>:<span className="badge green">Complete</span>}</td>
        <td>{ugx(Number(l.unit_cost_base))}/{l.base_unit}</td>
        <td>{ugx(Number(l.line_total||0))}</td>
        {allowReceive&&<td><div style={{display:"flex",gap:6,minWidth:190}}><input type="number" min="0.000001" step="any" style={{maxWidth:105}} value={quantities[l.id]??0} onChange={e=>setQuantities(prev=>({...prev,[l.id]:Number(e.target.value)}))}/><button className="btn primary" disabled={busy} onClick={()=>receive(l)}>Receive</button></div></td>}
      </tr>)}</tbody>
    </table></div>;
  }

  return <>
    <div className="pagehead"><div><h1>Purchase Receiving</h1><p>Receive approved supplier deliveries and keep completed receipts visible for audit.</p></div></div>
    {message&&<div className="hero" style={{padding:14}}><b>{message}</b></div>}

    <div className="grid4">
      <div className="card stat"><div className="label">Ordered Qty</div><div className="value">{ordered.toLocaleString()}</div></div>
      <div className="card stat"><div className="label">Received Qty</div><div className="value">{received.toLocaleString()}</div></div>
      <div className="card stat"><div className="label">Remaining Qty</div><div className="value">{remaining.toLocaleString()}</div></div>
      <div className="card stat"><div className="label">Purchase Line Value</div><div className="value">{ugx(value)}</div></div>
    </div>

    <div className="card" style={{marginTop:16}}>
      <h2 style={{color:"var(--brown)",marginTop:0}}>Awaiting Receipt</h2>
      <p style={{color:"var(--muted)"}}>Only approved purchase-order lines can increase raw-material stock.</p>
      {rows(openLines,true)}
    </div>

    <div className="card" style={{marginTop:16}}>
      <h2 style={{color:"var(--brown)",marginTop:0}}>Receipt History</h2>
      <p style={{color:"var(--muted)"}}>Fully received lines stay visible here instead of disappearing from the page.</p>
      {rows(completedLines,false)}
    </div>

    <div className="hero" style={{marginTop:16}}><h2>Receiving is protected</h2><p>Each receiving request carries a unique client request ID so a retry cannot silently post the same delivery twice.</p></div>
  </>;
}
