'use client';

import { useRef, useState } from "react";
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

  const [editing,setEditing]=useState<any|null>(null);
  const [editSupplierId,setEditSupplierId]=useState("");
  const [editPurchaseDate,setEditPurchaseDate]=useState("");
  const [editInvoiceNo,setEditInvoiceNo]=useState("");
  const [editInvoiceDate,setEditInvoiceDate]=useState("");
  const [editCreditDays,setEditCreditDays]=useState(0);
  const [editDiscount,setEditDiscount]=useState(0);
  const [editNotes,setEditNotes]=useState("");
  const [editLines,setEditLines]=useState<DraftLine[]>([]);
  const [editReason,setEditReason]=useState("");

  const draftTotal=Math.max(0,lines.reduce((s,l)=>s+(Number(l.ordered_qty_base)||0)*(Number(l.unit_cost_base)||0),0)-discount);
  const editTotal=Math.max(0,editLines.reduce((s,l)=>s+(Number(l.ordered_qty_base)||0)*(Number(l.unit_cost_base)||0),0)-editDiscount);

  function addLine(){
    if(materials[0])setLines(prev=>[...prev,{raw_material_id:materials[0].id,ordered_qty_base:1,unit_cost_base:0}]);
  }
  function removeLine(index:number){
    setLines(prev=>prev.filter((_,i)=>i!==index));
  }
  function addEditLine(){
    if(materials[0])setEditLines(prev=>[...prev,{raw_material_id:materials[0].id,ordered_qty_base:1,unit_cost_base:0}]);
  }
  function removeEditLine(index:number){
    setEditLines(prev=>prev.filter((_,i)=>i!==index));
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
      setMessage(`Purchase order created: ${data}`);
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

  async function startEdit(order:any){
    if(order.status!=="draft"||order.approval_status!=="pending"){
      setMessage("Only pending draft purchase orders can be edited. Received/approved purchases are protected.");
      return;
    }
    if(!live){setMessage("Demo mode: edit preview only.");return;}
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const [{data:p,error:pErr},{data:itemRows,error:iErr}]=await Promise.all([
        supabase.from("purchases")
          .select("id,purchase_no,supplier_id,purchase_date,supplier_invoice_no,invoice_date,credit_terms_days,discount,notes,status,approval_status,amount_paid")
          .eq("id",order.id).single(),
        supabase.from("purchase_items")
          .select("raw_material_id,ordered_qty_base,unit_cost_base,created_at")
          .eq("purchase_id",order.id)
          .order("created_at",{ascending:true}),
      ]);
      if(pErr)throw pErr;
      if(iErr)throw iErr;
      if(!p)throw new Error("Purchase order not found.");
      if(p.status!=="draft"||p.approval_status!=="pending"||Number(p.amount_paid||0)>0){
        throw new Error("This purchase can no longer be edited.");
      }
      setEditing(p);
      setEditSupplierId(p.supplier_id);
      setEditPurchaseDate(p.purchase_date);
      setEditInvoiceNo(p.supplier_invoice_no??"");
      setEditInvoiceDate(p.invoice_date??"");
      setEditCreditDays(Number(p.credit_terms_days??0));
      setEditDiscount(Number(p.discount??0));
      setEditNotes(p.notes??"");
      setEditLines((itemRows??[]).map((x:any)=>({
        raw_material_id:x.raw_material_id,
        ordered_qty_base:Number(x.ordered_qty_base),
        unit_cost_base:Number(x.unit_cost_base),
      })));
      setEditReason("");
      window.scrollTo({top:0,behavior:"smooth"});
    }catch(e){setMessage(e instanceof Error?e.message:"Could not load purchase for editing.");}
    finally{setBusy(false);}
  }

  async function saveEdit(){
    if(!editing)return;
    if(!editSupplierId||editLines.length===0){setMessage("Choose a supplier and keep at least one purchase line.");return;}
    if(editLines.some(l=>!l.raw_material_id||l.ordered_qty_base<=0||l.unit_cost_base<0)){setMessage("Every edited line needs a material, positive quantity and valid unit cost.");return;}
    if(!editReason.trim()){setMessage("A correction reason is required.");return;}
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {error}=await supabase.rpc("edit_purchase_order",{
        p_purchase_id:editing.id,
        p_supplier_id:editSupplierId,
        p_purchase_date:editPurchaseDate,
        p_supplier_invoice_no:editInvoiceNo.trim()||null,
        p_invoice_date:editInvoiceDate||null,
        p_credit_terms_days:editCreditDays,
        p_discount:editDiscount,
        p_notes:editNotes.trim()||null,
        p_items:editLines,
        p_reason:editReason.trim(),
      });
      if(error)throw error;
      setMessage(`Purchase order ${editing.purchase_no} corrected successfully.`);
      setEditing(null);
      setEditLines([]);
      setEditReason("");
      router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not edit purchase order.");}
    finally{setBusy(false);}
  }

  return <>
    <div className="pagehead">
      <div><h1>Purchase Orders</h1><p>Create, correct, approve and track supplier purchases without breaking stock or supplier balances.</p></div>
      <span className={canApprove?"badge green":"badge gold"}>{canApprove?"Approval Access":"Storekeeper View"}</span>
    </div>

    {message&&<div className="hero" style={{padding:14}}><b>{message}</b></div>}

    {editing&&<div className="card" style={{marginBottom:16,border:"2px solid var(--gold)"}}>
      <div className="pagehead" style={{marginBottom:10}}>
        <div><h2 style={{margin:0,color:"var(--brown)"}}>Edit Purchase Order {editing.purchase_no}</h2><p style={{marginTop:6}}>Only pending draft orders can be corrected. Every edit is audited.</p></div>
        <button className="btn secondary" onClick={()=>setEditing(null)} disabled={busy}>Cancel</button>
      </div>
      <div className="grid2">
        <div className="field"><label>Supplier</label><select value={editSupplierId} onChange={e=>setEditSupplierId(e.target.value)}>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div className="field"><label>Purchase date</label><input type="date" value={editPurchaseDate} onChange={e=>setEditPurchaseDate(e.target.value)}/></div>
      </div>
      <div className="grid2">
        <div className="field"><label>Supplier invoice no.</label><input value={editInvoiceNo} onChange={e=>setEditInvoiceNo(e.target.value)}/></div>
        <div className="field"><label>Invoice date</label><input type="date" value={editInvoiceDate} onChange={e=>setEditInvoiceDate(e.target.value)}/></div>
      </div>
      <div className="grid2">
        <div className="field"><label>Credit terms (days)</label><input type="number" min="0" value={editCreditDays} onChange={e=>setEditCreditDays(Number(e.target.value))}/></div>
        <div className="field"><label>Discount (UGX)</label><input type="number" min="0" value={editDiscount} onChange={e=>setEditDiscount(Number(e.target.value))}/></div>
      </div>

      {editLines.map((line,i)=>{
        const m=materials.find(x=>x.id===line.raw_material_id);
        return <div className="grid2" key={i} style={{borderTop:"1px solid var(--line)",paddingTop:8}}>
          <div className="field"><label>Material</label><select value={line.raw_material_id} onChange={e=>setEditLines(prev=>prev.map((x,j)=>j===i?{...x,raw_material_id:e.target.value}:x))}>{materials.map(m=><option key={m.id} value={m.id}>{m.name} ({m.base_unit})</option>)}</select></div>
          <div>
            <div className="grid2">
              <div className="field"><label>Qty ({m?.base_unit??"base"})</label><input type="number" min="0.000001" step="any" value={line.ordered_qty_base} onChange={e=>setEditLines(prev=>prev.map((x,j)=>j===i?{...x,ordered_qty_base:Number(e.target.value)}:x))}/></div>
              <div className="field"><label>Cost / {m?.base_unit??"unit"} (UGX)</label><input type="number" min="0" step="any" value={line.unit_cost_base} onChange={e=>setEditLines(prev=>prev.map((x,j)=>j===i?{...x,unit_cost_base:Number(e.target.value)}:x))}/></div>
            </div>
            {editLines.length>1&&<button className="btn secondary" onClick={()=>removeEditLine(i)} type="button">Remove line</button>}
          </div>
        </div>;
      })}
      <button className="btn secondary" onClick={addEditLine} type="button">+ Line</button>
      <div className="field"><label>Notes</label><input value={editNotes} onChange={e=>setEditNotes(e.target.value)}/></div>
      <div className="field"><label>Correction reason</label><input value={editReason} onChange={e=>setEditReason(e.target.value)} placeholder="Why are you changing this purchase order?"/></div>
      <p><b>Corrected total: {ugx(editTotal)}</b></p>
      <button className="btn primary" disabled={busy} onClick={saveEdit}>{busy?"Saving...":"Save Correction"}</button>
    </div>}

    <div className="card">
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
          <div>
            <div className="grid2">
              <div className="field"><label>Qty ({m?.base_unit??"base"})</label><input type="number" min="0.000001" step="any" value={line.ordered_qty_base} onChange={e=>setLines(prev=>prev.map((x,j)=>j===i?{...x,ordered_qty_base:Number(e.target.value)}:x))}/></div>
              <div className="field"><label>Cost / {m?.base_unit??"unit"} (UGX)</label><input type="number" min="0" step="any" value={line.unit_cost_base} onChange={e=>setLines(prev=>prev.map((x,j)=>j===i?{...x,unit_cost_base:Number(e.target.value)}:x))}/></div>
            </div>
            {lines.length>1&&<button className="btn secondary" onClick={()=>removeLine(i)} type="button">Remove line</button>}
          </div>
        </div>;
      })}
      <button className="btn secondary" onClick={addLine} type="button">+ Line</button>
      <div className="field"><label>Notes</label><input value={notes} onChange={e=>setNotes(e.target.value)}/></div>
      <p><b>Draft total: {ugx(draftTotal)}</b></p>
      <button className="btn primary" disabled={busy} onClick={createPO}>{busy?"Working...":"Create Purchase Order"}</button>
    </div>

    <div className="tablewrap" style={{marginTop:16}}>
      <table>
        <thead><tr><th>PO</th><th>Supplier</th><th>Total</th><th>Paid</th><th>Outstanding</th><th>Approval</th><th>Status</th><th>Payment</th><th>Due</th><th>Actions</th></tr></thead>
        <tbody>{orders.length===0?<tr><td colSpan={10}>No purchase orders found.</td></tr>:orders.map(o=>{
          const outstanding=Number(o.outstanding_amount??Math.max(0,Number(o.total_amount||0)-Number(o.amount_paid||0)));
          const editable=o.status==="draft"&&o.approval_status==="pending"&&Number(o.amount_paid||0)===0;
          const removable=canApprove&&["draft","ordered"].includes(o.status)&&Number(o.amount_paid||0)===0;
          return <tr key={o.id}>
            <td><b>{o.purchase_no}</b></td>
            <td>{o.supplier_name}</td>
            <td>{ugx(Number(o.total_amount||0))}</td>
            <td>{ugx(Number(o.amount_paid||0))}</td>
            <td><b>{ugx(outstanding)}</b></td>
            <td><span className={o.approval_status==="approved"?"badge green":o.approval_status==="pending"?"badge gold":"badge red"}>{String(o.approval_status).toUpperCase()}</span></td>
            <td>{String(o.status).replaceAll("_"," ")}</td>
            <td>{String(o.payment_status).replaceAll("_"," ")}</td>
            <td>{o.due_date??"—"}</td>
            <td>
              <div className="action-row">
                {editable&&<button className="btn secondary" disabled={busy} onClick={()=>startEdit(o)}>Edit</button>}
                {canApprove&&o.approval_status==="pending"&&<>
                  <button className="btn primary" disabled={busy} onClick={()=>decide(o.id,"approve")}>Approve</button>
                  <button className="btn secondary" disabled={busy} onClick={()=>decide(o.id,"reject")}>Reject</button>
                </>}
                {removable&&<RecycleActionButton entityType="purchase" entityId={o.id} label={o.purchase_no??"Purchase"} live={live}/>}
                {!editable&&!removable&&o.status==="received"&&<span className="badge green">RECEIVED - PROTECTED</span>}
                {!editable&&!removable&&Number(o.amount_paid||0)>0&&o.status!=="received"&&<span className="badge gold">PAYMENT RECORDED</span>}
              </div>
            </td>
          </tr>;
        })}</tbody>
      </table>
    </div>

    <div className="hero" style={{marginTop:16}}>
      <h2>Safe correction rules</h2>
      <p><b>Pending draft:</b> Edit or remove it. <b>Approved but not received/paid:</b> remove only when authorized. <b>Received:</b> stock history is protected. <b>Paid:</b> correct the supplier payment from Supplier Accounts instead of silently changing financial history.</p>
    </div>
  </>;
}
