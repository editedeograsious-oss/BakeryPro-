'use client';

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ugx } from "@/lib/costing";
import RecycleActionButton from "@/components/admin/RecycleActionButton";

type DraftLine={raw_material_id:string;ordered_qty_base:number;unit_cost_base:number};

export default function PurchaseOrderManager({
  orders,suppliers,materials,live,canApprove
}:{
  orders:any[];suppliers:any[];materials:any[];live:boolean;canApprove:boolean;
}){
  const router=useRouter();
  const [supplierId,setSupplierId]=useState(suppliers[0]?.id??"");
  const [purchaseDate,setPurchaseDate]=useState(new Date().toISOString().slice(0,10));
  const [invoiceNo,setInvoiceNo]=useState("");
  const [invoiceDate,setInvoiceDate]=useState("");
  const [creditDays,setCreditDays]=useState(0);
  const [discount,setDiscount]=useState(0);
  const [notes,setNotes]=useState("");
  const [lines,setLines]=useState<DraftLine[]>(
    materials[0]?[{raw_material_id:materials[0].id,ordered_qty_base:1,unit_cost_base:0}]:[]
  );
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const requestId=useRef(crypto.randomUUID());

  const draftTotal=Math.max(0,lines.reduce((s,l)=>s+(Number(l.ordered_qty_base)||0)*(Number(l.unit_cost_base)||0),0)-discount);
  const totalOrdered=useMemo(()=>orders.reduce((s:number,o:any)=>s+Number(o.total_amount||0),0),[orders]);
  const totalPaid=useMemo(()=>orders.reduce((s:number,o:any)=>s+Number(o.amount_paid||0),0),[orders]);
  const totalOwed=useMemo(()=>orders.reduce((s:number,o:any)=>s+Number(o.outstanding_amount||0),0),[orders]);
  const openCount=useMemo(()=>orders.filter((o:any)=>Number(o.outstanding_amount||0)>0||!["received","cancelled"].includes(o.status)).length,[orders]);

  function addLine(){
    if(materials[0])setLines(prev=>[...prev,{raw_material_id:materials[0].id,ordered_qty_base:1,unit_cost_base:0}]);
  }

  async function createPO(){
    if(!supplierId||lines.length===0){setMessage("Choose a supplier and add at least one line.");return;}
    if(lines.some(l=>!l.raw_material_id||l.ordered_qty_base<=0||l.unit_cost_base<0)){setMessage("Every line needs a material, positive quantity and valid unit cost.");return;}
    if(!live){setMessage("Demo mode: purchase order creation simulated.");return;}
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {data,error}=await supabase.rpc("create_purchase_order",{
        p_supplier_id:supplierId,
        p_purchase_date:purchaseDate,
        p_supplier_invoice_no:invoiceNo.trim()||null,
        p_invoice_date:invoiceDate||null,
        p_credit_terms_days:creditDays,
        p_discount:discount,
        p_notes:notes.trim()||null,
        p_items:lines,
        p_client_request_id:requestId.current,
      });
      if(error)throw error;
      setMessage(`Purchase order created • ${data}`);
      requestId.current=crypto.randomUUID();
      setInvoiceNo("");setInvoiceDate("");setDiscount(0);setNotes("");
      router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not create purchase order.");}
    finally{setBusy(false);}
  }

  async function decide(id:string,decision:"approve"|"reject"){
    if(!canApprove){setMessage("Only Owner/Manager can approve purchase orders.");return;}
    if(!live){setMessage(`Demo mode: purchase order ${decision}d.`);return;}
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {error}=await supabase.rpc("decide_purchase_order",{p_purchase_id:id,p_decision:decision,p_note:null});
      if(error)throw error;
      setMessage(`Purchase order ${decision}d.`);
      router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not decide purchase order.");}
    finally{setBusy(false);}
  }

  async function editDraft(order:any){
    if(order.status!=="draft"||order.approval_status!=="pending"){
      setMessage("Only pending draft purchase orders can be edited.");
      return;
    }
    if(!live){setMessage("Demo mode: draft correction simulated.");return;}

    const reason=window.prompt("Why are you correcting this purchase order?");
    if(!reason?.trim())return;

    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const [{data:p,error:pErr},{data:itemRows,error:iErr}]=await Promise.all([
        supabase.from("purchases")
          .select("supplier_id,purchase_date,supplier_invoice_no,invoice_date,credit_terms_days,discount,notes")
          .eq("id",order.id).single(),
        supabase.from("purchase_items")
          .select("raw_material_id,ordered_qty_base,unit_cost_base")
          .eq("purchase_id",order.id).order("created_at"),
      ]);
      if(pErr)throw pErr;if(iErr)throw iErr;

      const date=window.prompt("Purchase date (YYYY-MM-DD):",p.purchase_date??"");
      if(date===null)return;
      const inv=window.prompt("Supplier invoice number (blank if none):",p.supplier_invoice_no??"");
      if(inv===null)return;
      const invDate=window.prompt("Invoice date YYYY-MM-DD (blank if none):",p.invoice_date??"");
      if(invDate===null)return;
      const creditRaw=window.prompt("Credit terms in days:",String(p.credit_terms_days??0));
      if(creditRaw===null)return;
      const discountRaw=window.prompt("Discount (UGX):",String(p.discount??0));
      if(discountRaw===null)return;
      const note=window.prompt("Notes:",p.notes??"");
      if(note===null)return;

      const corrected:any[]=[];
      for(const item of itemRows??[]){
        const material=materials.find((m:any)=>m.id===item.raw_material_id);
        const qtyRaw=window.prompt(`Quantity for ${material?.name??"material"}:`,String(item.ordered_qty_base));
        if(qtyRaw===null)return;
        const costRaw=window.prompt(`Cost per ${material?.base_unit??"unit"} for ${material?.name??"material"}:`,String(item.unit_cost_base));
        if(costRaw===null)return;
        const qty=Number(qtyRaw),cost=Number(costRaw);
        if(qty<=0||cost<0)throw new Error("Corrected quantities must be positive and costs cannot be negative.");
        corrected.push({raw_material_id:item.raw_material_id,ordered_qty_base:qty,unit_cost_base:cost});
      }

      const {error}=await supabase.rpc("edit_purchase_order",{
        p_purchase_id:order.id,
        p_supplier_id:p.supplier_id,
        p_purchase_date:date,
        p_supplier_invoice_no:inv.trim()||null,
        p_invoice_date:invDate.trim()||null,
        p_credit_terms_days:Number(creditRaw),
        p_discount:Number(discountRaw),
        p_notes:note.trim()||null,
        p_items:corrected,
        p_reason:reason.trim(),
      });
      if(error)throw error;
      setMessage("Purchase order corrected.");
      router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not edit purchase order.");}
    finally{setBusy(false);}
  }

  return <>
    <div className="pagehead">
      <div><h1>Purchase Orders</h1><p>Create, approve and track supplier purchases from order to payment.</p></div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <a className="btn secondary" href="/purchases">Receive Stock</a>
        <a className="btn secondary" href="/supplier-accounts">Supplier Accounts</a>
      </div>
    </div>

    {message&&<div className="hero" style={{padding:14}}><b>{message}</b></div>}

    <div className="grid4">
      <div className="card stat"><div className="label">Purchase Value</div><div className="value">{ugx(totalOrdered)}</div></div>
      <div className="card stat"><div className="label">Paid</div><div className="value">{ugx(totalPaid)}</div></div>
      <div className="card stat"><div className="label">Amount Owed</div><div className="value">{ugx(totalOwed)}</div></div>
      <div className="card stat"><div className="label">Open / Unsettled</div><div className="value">{openCount}</div></div>
    </div>

    <div className="card" style={{marginTop:16}}>
      <h3 style={{color:"var(--brown)",marginTop:0}}>New Purchase Order</h3>
      <div className="grid2">
        <div className="field"><label>Supplier</label><select value={supplierId} onChange={e=>setSupplierId(e.target.value)}>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div className="field"><label>Purchase date</label><input type="date" value={purchaseDate} onChange={e=>setPurchaseDate(e.target.value)}/></div>
      </div>
      <div className="grid2">
        <div className="field"><label>Supplier invoice no. (optional)</label><input value={invoiceNo} onChange={e=>setInvoiceNo(e.target.value)}/></div>
        <div className="field"><label>Invoice date (optional)</label><input type="date" value={invoiceDate} onChange={e=>setInvoiceDate(e.target.value)}/></div>
      </div>
      <div className="grid2">
        <div className="field"><label>Credit terms (days)</label><input type="number" min="0" value={creditDays} onChange={e=>setCreditDays(Number(e.target.value))}/></div>
        <div className="field"><label>Discount (UGX)</label><input type="number" min="0" value={discount} onChange={e=>setDiscount(Number(e.target.value))}/></div>
      </div>

      {lines.map((line,i)=>{
        const m=materials.find(x=>x.id===line.raw_material_id);
        return <div className="grid2" key={i} style={{borderTop:"1px solid var(--line)",paddingTop:8}}>
          <div className="field"><label>Material</label><select value={line.raw_material_id} onChange={e=>setLines(prev=>prev.map((x,j)=>j===i?{...x,raw_material_id:e.target.value}:x))}>{materials.map(m=><option key={m.id} value={m.id}>{m.name} ({m.base_unit})</option>)}</select></div>
          <div className="grid2">
            <div className="field"><label>Qty ({m?.base_unit??"base"})</label><input type="number" min="0.000001" step="any" value={line.ordered_qty_base} onChange={e=>setLines(prev=>prev.map((x,j)=>j===i?{...x,ordered_qty_base:Number(e.target.value)}:x))}/></div>
            <div className="field"><label>Cost / {m?.base_unit??"unit"} (UGX)</label><input type="number" min="0" step="any" value={line.unit_cost_base} onChange={e=>setLines(prev=>prev.map((x,j)=>j===i?{...x,unit_cost_base:Number(e.target.value)}:x))}/></div>
          </div>
        </div>
      })}
      <button className="btn secondary" onClick={addLine}>+ Line</button>
      <div className="field"><label>Notes</label><input value={notes} onChange={e=>setNotes(e.target.value)}/></div>
      <p><b>Draft total: {ugx(draftTotal)}</b></p>
      <button className="btn primary" disabled={busy} onClick={createPO}>{busy?"Working…":"Create Purchase Order"}</button>
    </div>

    <div className="tablewrap" style={{marginTop:16}}>
      <table>
        <thead><tr><th>PO</th><th>Supplier</th><th>Total</th><th>Paid</th><th>Owed</th><th>Approval</th><th>Receiving</th><th>Payment</th><th>Due</th><th>Actions</th></tr></thead>
        <tbody>{orders.length===0?<tr><td colSpan={10}>No purchase orders found.</td></tr>:orders.map(o=><tr key={o.id}>
          <td><b>{o.purchase_no}</b>{o.supplier_invoice_no&&<><br/><span style={{fontSize:12,color:"var(--muted)"}}>Invoice {o.supplier_invoice_no}</span></>}</td>
          <td>{o.supplier_name}</td>
          <td>{ugx(Number(o.total_amount||0))}</td>
          <td>{ugx(Number(o.amount_paid||0))}</td>
          <td><b>{ugx(Number(o.outstanding_amount||0))}</b></td>
          <td><span className={o.approval_status==="approved"?"badge green":o.approval_status==="pending"?"badge gold":"badge red"}>{String(o.approval_status).toUpperCase()}</span></td>
          <td><span className={o.status==="received"?"badge green":o.status==="partially_received"?"badge gold":"badge"}>{String(o.status??"").replaceAll("_"," ").toUpperCase()}</span></td>
          <td><span className={o.payment_status==="paid"?"badge green":o.payment_status==="partial"?"badge gold":"badge red"}>{String(o.payment_status??"").toUpperCase()}</span></td>
          <td>{o.due_date??"—"}</td>
          <td><div className="action-row">
            {o.status==="draft"&&o.approval_status==="pending"&&<button className="btn secondary" disabled={busy} onClick={()=>editDraft(o)}>Edit Draft</button>}
            {canApprove&&o.approval_status==="pending"&&<><button className="btn primary" disabled={busy} onClick={()=>decide(o.id,"approve")}>Approve</button><button className="btn secondary" disabled={busy} onClick={()=>decide(o.id,"reject")}>Reject</button></>}
            {canApprove&&["draft","ordered"].includes(o.status)&&Number(o.amount_paid||0)===0&&<RecycleActionButton entityType="purchase" entityId={o.id} label={o.purchase_no??"Purchase"} live={live}/>}
          </div></td>
        </tr>)}</tbody>
      </table>
    </div>

    <div className="hero" style={{marginTop:16}}>
      <h2>Order, receipt and payment stay separate</h2>
      <p>Approval does not increase stock. Stock changes only when goods are received, and supplier balances reduce only when payments are recorded.</p>
    </div>
  </>;
}
