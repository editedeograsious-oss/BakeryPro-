'use client';

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ugx } from "@/lib/costing";

export default function PurchaseReceivingPanel({lines,live}:{lines:any[];live:boolean}){
  const router=useRouter();
  const [quantities,setQuantities]=useState<Record<string,number>>({});
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const requests=useRef<Record<string,string>>({});

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
    <div className="pagehead"><div><h1>Purchases & Goods Receipt</h1><p>Receive approved orders here. Draft, completed and cancelled orders remain in Purchase Orders.</p></div><Link className="btn secondary" href="/purchase-orders">View Purchase Orders</Link></div>
    {message&&<div className="hero" style={{padding:14}}><b>{message}</b></div>}
    <div className="tablewrap"><table><thead><tr><th>PO</th><th>Supplier</th><th>Material</th><th>Ordered</th><th>Received</th><th>Remaining</th><th>Unit Cost</th><th>Receive</th></tr></thead>
      <tbody>{lines.length===0?<tr><td colSpan={8}>No approved purchase lines awaiting receipt. Open Purchase Orders to create or approve an order, or review completed purchases.</td></tr>:lines.map(l=><tr key={l.id}>
        <td><b>{l.purchase_no}</b></td><td>{l.supplier_name}</td><td>{l.material_name}</td><td>{Number(l.ordered_qty_base).toLocaleString()} {l.base_unit}</td><td>{Number(l.received_qty_base).toLocaleString()} {l.base_unit}</td><td><b>{Number(l.remaining_qty_base).toLocaleString()} {l.base_unit}</b></td><td>{ugx(Number(l.unit_cost_base))}/{l.base_unit}</td>
        <td><div style={{display:"flex",gap:6,minWidth:190}}><input type="number" min="0.000001" step="any" style={{maxWidth:105}} value={quantities[l.id]??0} onChange={e=>setQuantities(prev=>({...prev,[l.id]:Number(e.target.value)}))}/><button className="btn primary" disabled={busy} onClick={()=>receive(l)}>Receive</button></div></td>
      </tr>)}</tbody>
    </table></div>
    <div className="hero" style={{marginTop:16}}><h2>Receipt is idempotent</h2><p>A client request ID is stored for each receiving attempt, reducing the risk of a network retry posting the same delivery twice.</p></div>
  </>;
}
