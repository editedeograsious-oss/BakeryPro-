'use client';

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ugx } from "@/lib/costing";

export default function PurchaseReceivingPanel({
  lines,history,live,operationsAllowed,operationsReason
}:{
  lines:any[];history:any[];live:boolean;operationsAllowed:boolean;operationsReason:string;
}){
  const router=useRouter();
  const [quantities,setQuantities]=useState<Record<string,number>>({});
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const requests=useRef<Record<string,string>>({});

  async function receive(line:any){
    if(!operationsAllowed){setMessage(operationsReason);return;}
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
      <div><h1>Purchases / Receiving</h1><p>Receive approved supplier deliveries and keep a permanent receipt history.</p></div>
      <span className={operationsAllowed?"badge green":"badge gold"}>{operationsAllowed?"Receiving Enabled":"Operations Locked"}</span>
    </div>

    {!operationsAllowed&&<div className="hero" style={{padding:14}}>
      <b>Receiving is currently locked.</b>
      <p style={{marginBottom:0}}>{operationsReason}. Existing receiving history remains visible below.</p>
    </div>}

    {message&&<div className="hero" style={{padding:14}}><b>{message}</b></div>}

    <div className="card">
      <h3 style={{color:"var(--brown)",marginTop:0}}>Awaiting Receipt</h3>
      <div className="tablewrap"><table>
        <thead><tr><th>PO</th><th>Supplier</th><th>Material</th><th>Ordered</th><th>Received</th><th>Remaining</th><th>Unit Cost</th><th>Receive</th></tr></thead>
        <tbody>{lines.length===0?<tr><td colSpan={8}>No approved purchase lines are waiting for receipt.</td></tr>:lines.map((l:any)=><tr key={l.id}>
          <td><b>{l.purchase_no}</b></td>
          <td>{l.supplier_name}</td>
          <td>{l.material_name}</td>
          <td>{Number(l.ordered_qty_base).toLocaleString()} {l.base_unit}</td>
          <td>{Number(l.received_qty_base).toLocaleString()} {l.base_unit}</td>
          <td><b>{Number(l.remaining_qty_base).toLocaleString()} {l.base_unit}</b></td>
          <td>{ugx(Number(l.unit_cost_base))}/{l.base_unit}</td>
          <td><div style={{display:"flex",gap:6,minWidth:190}}>
            <input type="number" min="0.000001" step="any" style={{maxWidth:105}} value={quantities[l.id]??0} onChange={e=>setQuantities(prev=>({...prev,[l.id]:Number(e.target.value)}))}/>
            <button className="btn primary" disabled={busy||!operationsAllowed} onClick={()=>receive(l)}>{!operationsAllowed?"Locked":"Receive"}</button>
          </div></td>
        </tr>)}</tbody>
      </table></div>
    </div>

    <div className="card" style={{marginTop:16}}>
      <h3 style={{color:"var(--brown)",marginTop:0}}>Recent Purchase Receipt History</h3>
      <p style={{color:"var(--muted)"}}>Completed purchase lines remain here even after there is nothing left to receive.</p>
      <div className="tablewrap"><table>
        <thead><tr><th>PO</th><th>Supplier</th><th>Material</th><th>Ordered</th><th>Received</th><th>Remaining</th><th>Line Total</th><th>Purchase Total</th><th>Paid</th><th>Outstanding</th><th>Receipt Status</th><th>Payment</th></tr></thead>
        <tbody>{history.length===0?<tr><td colSpan={12}>No purchase history found.</td></tr>:history.map((h:any)=><tr key={h.id}>
          <td><b>{h.purchase_no}</b><br/><span style={{fontSize:12,color:"var(--muted)"}}>{h.purchase_date}</span></td>
          <td>{h.supplier_name}</td>
          <td>{h.material_name}</td>
          <td>{Number(h.ordered_qty_base||0).toLocaleString()} {h.base_unit}</td>
          <td>{Number(h.received_qty_base||0).toLocaleString()} {h.base_unit}</td>
          <td>{Number(h.remaining_qty_base||0).toLocaleString()} {h.base_unit}</td>
          <td>{ugx(Number(h.line_total||0))}</td>
          <td>{ugx(Number(h.total_amount||0))}</td>
          <td>{ugx(Number(h.amount_paid||0))}</td>
          <td><b>{ugx(Number(h.outstanding_amount||0))}</b></td>
          <td><span className={Number(h.remaining_qty_base||0)===0?"badge green":"badge gold"}>{Number(h.remaining_qty_base||0)===0?"RECEIVED":"PARTIAL"}</span></td>
          <td><span className={h.payment_status==="paid"?"badge green":h.payment_status==="partial"?"badge gold":"badge red"}>{String(h.payment_status??"unpaid").toUpperCase()}</span></td>
        </tr>)}</tbody>
      </table></div>
    </div>

    <div className="hero" style={{marginTop:16}}>
      <h2>Receiving changes stock; payment changes the supplier balance</h2>
      <p>These are separate controls. Receiving stock increases inventory. Supplier payments reduce the amount owed without changing stock again.</p>
    </div>
  </>;
}
