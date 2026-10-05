'use client';

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ugx } from "@/lib/costing";
import RecycleActionButton from "@/components/admin/RecycleActionButton";

type DraftLine={raw_material_id:string;ordered_qty_base:number;unit_cost_base:number};

export default function PurchaseOrderManager({orders,suppliers,materials,live,canApprove}:{orders:any[];suppliers:any[];materials:any[];live:boolean;canApprove:boolean}){
  const router=useRouter();
  const [editingId,setEditingId]=useState<string|null>(null);
  const [supplierId,setSupplierId]=useState(suppliers[0]?.id??"");
  const [purchaseDate,setPurchaseDate]=useState(new Date().toISOString().slice(0,10));
  const [invoiceNo,setInvoiceNo]=useState("");
  const [invoiceDate,setInvoiceDate]=useState("");
  const [creditDays,setCreditDays]=useState(0);
  const [discount,setDiscount]=useState(0);
  const [notes,setNotes]=useState("");
  const [lines,setLines]=useState<DraftLine[]>(materials[0]?[{raw_material_id:materials[0].id,ordered_qty_base:1,unit_cost_base:0}]:[]);
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const requestId=useRef(crypto.randomUUID());

  const subtotalValue=lines.reduce((s,l)=>s+(Number(l.ordered_qty_base)||0)*(Number(l.unit_cost_base)||0),0);
  const draftTotal=Math.max(0,subtotalValue-discount);

  function resetForm(){setEditingId(null);setSupplierId(suppliers[0]?.id??"");setPurchaseDate(new Date().toISOString().slice(0,10));setInvoiceNo("");setInvoiceDate("");setCreditDays(0);setDiscount(0);setNotes("");setLines(materials[0]?[{raw_material_id:materials[0].id,ordered_qty_base:1,unit_cost_base:0}]:[]);requestId.current=crypto.randomUUID();}
  function addLine(){if(materials[0])setLines(prev=>[...prev,{raw_material_id:materials[0].id,ordered_qty_base:1,unit_cost_base:0}]);}
  function removeLine(i:number){setLines(prev=>prev.filter((_,j)=>j!==i));}

  async function startEdit(row:any){
    if(!live){setMessage("Demo mode: purchase order edit simulated.");return;}
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const [{data:p,error:pErr},{data:itemRows,error:iErr}]=await Promise.all([
        supabase.from("purchases").select("supplier_id,purchase_date,supplier_invoice_no,invoice_date,credit_terms_days,discount,notes,status,approval_status,amount_paid").eq("id",row.id).single(),
        supabase.from("purchase_items").select("raw_material_id,ordered_qty_base,unit_cost_base,received_qty_base").eq("purchase_id",row.id)
      ]);
      if(pErr)throw pErr;if(iErr)throw iErr;
      if(p.status!=="draft"||p.approval_status!=="pending"||Number(p.amount_paid||0)>0||(itemRows??[]).some((x:any)=>Number(x.received_qty_base||0)>0)){throw new Error("Only pending draft purchase orders with no payment or receiving can be edited.");}
      setEditingId(row.id);setSupplierId(p.supplier_id);setPurchaseDate(p.purchase_date);setInvoiceNo(p.supplier_invoice_no??"");setInvoiceDate(p.invoice_date??"");setCreditDays(Number(p.credit_terms_days??0));setDiscount(Number(p.discount??0));setNotes(p.notes??"");setLines((itemRows??[]).map((x:any)=>({raw_material_id:x.raw_material_id,ordered_qty_base:Number(x.ordered_qty_base),unit_cost_base:Number(x.unit_cost_base)})));
      window.scrollTo({top:0,behavior:"smooth"});
    }catch(e){setMessage(e instanceof Error?e.message:"Could not load purchase order for editing.");}
    finally{setBusy(false);}
  }

  async function savePO(){
    if(!supplierId||lines.length===0){setMessage("Choose a supplier and add at least one line.");return;}
    if(lines.some(l=>!l.raw_material_id||l.ordered_qty_base<=0||l.unit_cost_base<0)){setMessage("Every line needs a material, positive quantity and valid unit cost.");return;}
    if(discount<0||discount>subtotalValue){setMessage("Discount cannot exceed the purchase subtotal.");return;}
    if(!live){setMessage(`Demo mode: purchase order ${editingId?"update":"creation"} simulated.`);return;}
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      if(editingId){
        const reason=window.prompt("Reason for correcting this purchase order:")?.trim();
        if(!reason){setBusy(false);setMessage("Correction reason is required.");return;}
        const {error}=await supabase.rpc("edit_purchase_order",{p_purchase_id:editingId,p_supplier_id:supplierId,p_purchase_date:purchaseDate,p_supplier_invoice_no:invoiceNo.trim()||null,p_invoice_date:invoiceDate||null,p_credit_terms_days:creditDays,p_discount:discount,p_notes:notes.trim()||null,p_items:lines,p_reason:reason});
        if(error)throw error;setMessage("Purchase order corrected. Previous values remain in the audit log.");
      }else{
        const {data,error}=await supabase.rpc("create_purchase_order",{p_supplier_id:supplierId,p_purchase_date:purchaseDate,p_supplier_invoice_no:invoiceNo.trim()||null,p_invoice_date:invoiceDate||null,p_credit_terms_days:creditDays,p_discount:discount,p_notes:notes.trim()||null,p_items:lines,p_client_request_id:requestId.current});
        if(error)throw error;setMessage(`Purchase order created • ${data}`);
      }
      resetForm();router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not save purchase order.");}
    finally{setBusy(false);}
  }

  async function decide(id:string,decision:"approve"|"reject"){
    if(!canApprove){setMessage("Only Owner/Manager can approve purchase orders.");return;}
    if(!live){setMessage(`Demo mode: purchase order ${decision}d.`);return;}
    setBusy(true);setMessage("");
    try{const supabase=createClient();const {error}=await supabase.rpc("decide_purchase_order",{p_purchase_id:id,p_decision:decision,p_note:null});if(error)throw error;setMessage(`Purchase order ${decision}d.`);router.refresh();}
    catch(e){setMessage(e instanceof Error?e.message:"Could not decide purchase order.");}
    finally{setBusy(false);}
  }

  return <>
    <div className="pagehead"><div><h1>Purchase Orders</h1><p>Prepare, correct, approve and receive purchases without breaking the stock ledger.</p></div><span className={canApprove?"badge green":"badge gold"}>{canApprove?"Approval Access":"Storekeeper View"}</span></div>
    {message&&<div className="hero" style={{padding:14}}><b>{message}</b></div>}
    <div className="card"><div className="pagehead" style={{marginBottom:8}}><div><h3 style={{color:"var(--brown)",margin:0}}>{editingId?"Edit Purchase Order":"New Purchase Order"}</h3></div>{editingId&&<button className="btn secondary" onClick={resetForm}>Cancel Edit</button>}</div>
      <div className="grid2"><div className="field"><label>Supplier</label><select value={supplierId} onChange={e=>setSupplierId(e.target.value)}>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div><div className="field"><label>Purchase date</label><input type="date" value={purchaseDate} onChange={e=>setPurchaseDate(e.target.value)}/></div></div>
      <div className="grid2"><div className="field"><label>Supplier invoice no. (optional)</label><input value={invoiceNo} onChange={e=>setInvoiceNo(e.target.value)}/></div><div className="field"><label>Invoice date (optional)</label><input type="date" value={invoiceDate} onChange={e=>setInvoiceDate(e.target.value)}/></div></div>
      <div className="grid2"><div className="field"><label>Credit terms (days)</label><input type="number" min="0" value={creditDays} onChange={e=>setCreditDays(Number(e.target.value))}/></div><div className="field"><label>Discount (UGX)</label><input type="number" min="0" value={discount} onChange={e=>setDiscount(Number(e.target.value))}/></div></div>
      {lines.map((line,i)=>{const m=materials.find(x=>x.id===line.raw_material_id);return <div className="grid2" key={i} style={{borderTop:"1px solid var(--line)",paddingTop:8}}><div className="field"><label>Material</label><select value={line.raw_material_id} onChange={e=>setLines(prev=>prev.map((x,j)=>j===i?{...x,raw_material_id:e.target.value}:x))}>{materials.map(m=><option key={m.id} value={m.id}>{m.name} ({m.base_unit})</option>)}</select></div><div><div className="grid2"><div className="field"><label>Qty ({m?.base_unit??"base"})</label><input type="number" min="0.000001" step="any" value={line.ordered_qty_base} onChange={e=>setLines(prev=>prev.map((x,j)=>j===i?{...x,ordered_qty_base:Number(e.target.value)}:x))}/></div><div className="field"><label>Cost / {m?.base_unit??"unit"} (UGX)</label><input type="number" min="0" step="any" value={line.unit_cost_base} onChange={e=>setLines(prev=>prev.map((x,j)=>j===i?{...x,unit_cost_base:Number(e.target.value)}:x))}/></div></div>{lines.length>1&&<button className="btn secondary" onClick={()=>removeLine(i)}>Remove Line</button>}</div></div>})}
      <button className="btn secondary" onClick={addLine}>+ Line</button><div className="field"><label>Notes</label><input value={notes} onChange={e=>setNotes(e.target.value)}/></div><p><b>Draft total: {ugx(draftTotal)}</b></p><button className="btn primary" disabled={busy} onClick={savePO}>{busy?"Working…":editingId?"Save Purchase Order Changes":"Create Purchase Order"}</button>
    </div>
    <div className="tablewrap" style={{marginTop:16}}><table><thead><tr><th>PO</th><th>Supplier</th><th>Amount</th><th>Requested By</th><th>Approval</th><th>Status</th><th>Payment</th><th>Due</th><th>Action</th></tr></thead><tbody>{orders.length===0?<tr><td colSpan={9}>No purchase orders found.</td></tr>:orders.map(o=><tr key={o.id}><td><b>{o.purchase_no}</b></td><td>{o.supplier_name}</td><td>{ugx(Number(o.total_amount))}</td><td>{o.requested_by_name??"—"}</td><td><span className={o.approval_status==="approved"?"badge green":o.approval_status==="pending"?"badge gold":"badge red"}>{o.approval_status}</span></td><td>{o.status}</td><td>{o.payment_status}</td><td>{o.due_date??"—"}</td><td><div className="action-row">{o.status==="draft"&&o.approval_status==="pending"&&Number(o.amount_paid||0)===0&&<button className="btn secondary" disabled={busy} onClick={()=>startEdit(o)}>Edit</button>}{canApprove&&o.approval_status==="pending"&&<><button className="btn primary" disabled={busy} onClick={()=>decide(o.id,"approve")}>Approve</button><button className="btn secondary" disabled={busy} onClick={()=>decide(o.id,"reject")}>Reject</button></>}{canApprove&&["draft","ordered"].includes(o.status)&&Number(o.amount_paid||0)===0&&<RecycleActionButton entityType="purchase" entityId={o.id} label={o.purchase_no??"Purchase"} live={live}/>}</div></td></tr>)}</tbody></table></div>
    <div className="hero" style={{marginTop:16}}><h2>Safe correction rule</h2><p>Pending draft orders can be edited. Once approved, paid or received, use receiving/payment adjustment or cancellation workflows instead of rewriting history.</p></div>
  </>;
}
