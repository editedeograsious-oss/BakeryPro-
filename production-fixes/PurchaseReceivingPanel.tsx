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

  const openLines=lines.filter(l=>Number(l.remaining_qty_base)>0);
  const openPOs=useMemo(()=>new Set(openLines.map(l=>l.purchase_id)).size,[openLines]);
  const suppliers=useMemo(()=>new Set(openLines.map(l=>l.supplier_id)).size,[openLines]);
  const remainingValue=openLines.reduce((s,l)=>s+Number(l.remaining_qty_base||0)*Number(l.unit_cost_base||0),0);

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
    <div className="pagehead">
      <div><h1>Purchases / Stock Receiving</h1><p>Receive approved supplier deliveries and keep completed receipt lines visible for verification.</p></div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <a className="btn secondary" href="/purchase-orders">Purchase Orders</a>
        <a className="btn secondary" href="/supplier-accounts">Supplier Accounts</a>
      </div>
    </div>

    {message&&<div className="hero" style={{padding:14}}><b>{message}</b></div>}

    <div className="grid4">
      <div className="card stat"><div className="label">Open Receiving Lines</div><div className="value">{openLines.length}</div></div>
      <div className="card stat"><div className="label">Open Purchase Orders</div><div className="value">{openPOs}</div></div>
      <div className="card stat"><div className="label">Suppliers Awaiting Receipt</div><div className="value">{suppliers}</div></div>
      <div className="card stat"><div className="label">Remaining Stock Value</div><div className="value">{ugx(remainingValue)}</div></div>
    </div>

    <div className="tablewrap" style={{marginTop:16}}>
      <table>
        <thead><tr><th>PO</th><th>Supplier</th><th>Material</th><th>Ordered</th><th>Received</th><th>Remaining</th><th>Unit Cost</th><th>Line Total</th><th>Status</th><th>Receive</th></tr></thead>
        <tbody>{lines.length===0?<tr><td colSpan={10}>No approved purchase lines found.</td></tr>:lines.map(l=>{
          const complete=Number(l.remaining_qty_base)<=0;
          return <tr key={l.id}>
            <td><b>{l.purchase_no}</b><br/><span style={{fontSize:12,color:"var(--muted)"}}>{l.purchase_date}</span></td>
            <td>{l.supplier_name}</td>
            <td>{l.material_name}</td>
            <td>{Number(l.ordered_qty_base).toLocaleString()} {l.base_unit}</td>
            <td>{Number(l.received_qty_base).toLocaleString()} {l.base_unit}</td>
            <td><b>{Number(l.remaining_qty_base).toLocaleString()} {l.base_unit}</b></td>
            <td>{ugx(Number(l.unit_cost_base))}/{l.base_unit}</td>
            <td>{ugx(Number(l.line_total||0))}</td>
            <td>{complete?<span className="badge green">RECEIVED</span>:Number(l.received_qty_base)>0?<span className="badge gold">PARTIAL</span>:<span className="badge gold">AWAITING</span>}</td>
            <td>{complete?<span className="badge green">Complete</span>:<div style={{display:"flex",gap:6,minWidth:190}}>
              <input type="number" min="0.000001" step="any" style={{maxWidth:105}} value={quantities[l.id]??0} onChange={e=>setQuantities(prev=>({...prev,[l.id]:Number(e.target.value)}))}/>
              <button className="btn primary" disabled={busy} onClick={()=>receive(l)}>Receive</button>
            </div>}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>

    <div className="hero" style={{marginTop:16}}>
      <h2>Receipt control</h2>
      <p>Each receipt uses a unique client request ID to reduce duplicate posting on retries. Completed lines remain visible here, while the stock ledger records every approved receipt separately.</p>
    </div>
  </>;
}
