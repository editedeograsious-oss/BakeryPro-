"use client";

import { useRef,useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ugx } from "@/lib/costing";

type Kind="raw_material"|"finished_goods"|"customer_credit";
const labels:Record<Kind,string>={raw_material:"Raw material stock",finished_goods:"Finished goods stock",customer_credit:"Existing customer debt"};
function errorText(e:unknown){return e&&typeof e==="object"&&"message" in e?String(e.message):"Could not save opening information.";}

export default function OpeningBalancesManager({drafts,materials,products,customers,status,live}:{drafts:any[];materials:any[];products:any[];customers:any[];status:any;live:boolean}){
  const router=useRouter();
  const [kind,setKind]=useState<Kind>(status?.can_prepare_stock?"raw_material":"customer_credit");
  const [editing,setEditing]=useState<any|null>(null);
  const [subject,setSubject]=useState("");
  const [date,setDate]=useState(status?.business_date??"");
  const [quantity,setQuantity]=useState("");const [cost,setCost]=useState("");const [balance,setBalance]=useState("");
  const [due,setDue]=useState("");const [reference,setReference]=useState("");const [notes,setNotes]=useState("");
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  const request=useRef(crypto.randomUUID());
  const credit=kind==="customer_credit";
  const permitted=(k:Kind)=>Boolean(status?.editable&&(k==="customer_credit"?status.can_prepare_credit:status.can_prepare_stock));
  const canEdit=permitted(kind);
  const choices=credit?customers.map(c=>({id:c.id,name:c.full_name,unit:""})):kind==="raw_material"?materials.map(m=>({...m,unit:m.base_unit})):products.map(p=>({...p,unit:"pcs"}));
  const selected=choices.find(c=>c.id===subject);
  const active=drafts.filter(d=>!d.voided_at);
  const value=(d:any)=>d.kind==="customer_credit"?Number(d.balance_due):Number(d.quantity)*Number(d.unit_cost);
  const total=(k:Kind)=>active.filter(d=>d.kind===k).reduce((s,d)=>s+value(d),0);

  function clear(k:Kind=kind){
    setKind(k);setEditing(null);setSubject("");setDate(status?.business_date??"");setQuantity("");setCost("");setBalance("");setDue("");setReference("");setNotes("");request.current=crypto.randomUUID();
  }
  function edit(d:any){
    setKind(d.kind);setEditing(d);setSubject(d.raw_material_id??d.product_id??d.customer_id);setDate(d.as_of_date);
    setQuantity(d.quantity==null?"":String(d.quantity));setCost(d.unit_cost==null?"":String(d.unit_cost));setBalance(d.balance_due==null?"":String(d.balance_due));
    setDue(d.due_date??"");setReference(d.reference??"");setNotes(d.notes??"");request.current=crypto.randomUUID();
    window.scrollTo({top:0,behavior:"smooth"});
  }
  async function save(){
    if(!canEdit||busy)return;
    if(!subject||!date){setMessage("Choose an item or customer and an opening date.");return;}
    if(date>status.business_date){setMessage("Opening date cannot be in the future.");return;}
    if(credit){if(!balance.trim()||!Number.isFinite(Number(balance))||Number(balance)<=0){setMessage("Enter the positive amount still owed, in UGX.");return;}}
    else if(!quantity.trim()||!cost.trim()||!Number.isFinite(Number(quantity))||Number(quantity)<=0||!Number.isFinite(Number(cost))||Number(cost)<0){setMessage("Enter a positive quantity and a unit cost of zero or more.");return;}
    else if(kind==="finished_goods"&&!Number.isInteger(Number(quantity))){setMessage("Enter whole pieces for finished goods.");return;}
    if(!live){setMessage("Demo mode: opening draft simulated. Live stock and balances are unchanged.");return;}
    setBusy(true);setMessage("");
    try{
      const {error}=await createClient().rpc("save_opening_balance_draft",{
        p_draft_id:editing?.id??null,p_kind:kind,p_subject_id:subject,p_as_of_date:date,
        p_quantity:credit?null:Number(quantity),p_unit_cost:credit?null:Number(cost),p_balance_due:credit?Number(balance):null,
        p_due_date:credit&&due?due:null,p_reference:reference.trim()||null,p_notes:notes.trim()||null,
        p_client_request_id:request.current,p_expected_version:editing?.version??null,
      });
      if(error)throw error;
      clear();setMessage("Opening draft saved for review. Live stock, customer balances, sales and cash are unchanged.");router.refresh();
    }catch(e){setMessage(errorText(e));}finally{setBusy(false);}
  }
  async function correct(d:any){
    if(!permitted(d.kind)||busy)return;
    const voided=!d.voided_at;
    const reason=window.prompt(`Reason to ${voided?"void":"restore"} this opening draft:`);
    if(!reason?.trim())return;
    if(!live){setMessage("Demo mode: opening draft correction simulated.");return;}
    setBusy(true);setMessage("");
    try{
      const {error}=await createClient().rpc("set_opening_draft_voided",{p_draft_id:d.id,p_voided:voided,p_reason:reason.trim(),p_expected_version:d.version});
      if(error)throw error;
      if(editing?.id===d.id)clear();
      setMessage(voided?"Opening draft voided; it is excluded from the draft totals.":"Opening draft restored for review.");router.refresh();
    }catch(e){setMessage(errorText(e));}finally{setBusy(false);}
  }

  return <>
    <div className="pagehead"><div><h1>Opening Stock & Customer Debts</h1><p>Prepare what the bakery already owns and what customers already owe.</p></div></div>
    <div className="hero" style={{padding:16,marginBottom:16}}><b>Drafts only — live operations remain locked.</b><p>Save physically counted stock and the amount each customer still owes. These drafts do not change live stock, Credit Book balances, sales or cash. Posting opening balances and final cutover require the Owner&apos;s explicit approval.</p><p>New supplier deliveries belong in <a href="/purchases">Purchases & Receiving</a>. Keep them separate from opening stock to avoid counting them twice.</p>{!status?.editable&&<p><b>{status?.reason??"Opening drafts are closed."}</b></p>}</div>
    {message&&<div className="hero" role="status" style={{padding:14,marginBottom:16}}>{message}</div>}
    <div className="grid4">
      <div className="card stat"><div className="label">Draft Raw Material Value</div><div className="value">{ugx(total("raw_material"))}</div></div>
      <div className="card stat"><div className="label">Draft Finished Goods Value</div><div className="value">{ugx(total("finished_goods"))}</div></div>
      <div className="card stat"><div className="label">Draft Customer Debts</div><div className="value">{ugx(total("customer_credit"))}</div></div>
      <div className="card stat"><div className="label">Active Opening Drafts</div><div className="value">{active.length}</div></div>
    </div>
    <div className="grid2" style={{marginTop:16}}>
      <div className="card"><h2 style={{marginTop:0,color:"var(--brown)"}}>{editing?"Edit Opening Draft":"Add Opening Draft"}</h2>
        <div className="field"><label htmlFor="opening-kind">Opening information</label><select id="opening-kind" value={kind} disabled={busy||Boolean(editing)} onChange={e=>clear(e.target.value as Kind)}>{Object.entries(labels).map(([k,label])=><option key={k} value={k} disabled={!permitted(k as Kind)}>{label}</option>)}</select></div>
        <div className="field"><label htmlFor="opening-subject">{credit?"Customer":"Stock item"}</label><select id="opening-subject" value={subject} disabled={busy||Boolean(editing)||!canEdit} onChange={e=>{setSubject(e.target.value);request.current=crypto.randomUUID();}}><option value="">Select {credit?"customer":"stock item"}</option>{choices.map(c=><option key={c.id} value={c.id}>{c.name}{c.unit?` (${c.unit})`:""}</option>)}</select></div>
        {choices.length===0&&<p>No active {credit?"customers":"items"} found. Add the {credit?"customer":"item"} first using the links alongside this form.</p>}
        <div className="field"><label htmlFor="opening-date">Opening balance date</label><input id="opening-date" type="date" max={status?.business_date} value={date} disabled={!canEdit||busy} onChange={e=>setDate(e.target.value)}/></div>
        {credit?<><div className="field"><label htmlFor="opening-balance">Amount still owed (UGX)</label><input id="opening-balance" type="number" min="0.01" step="0.01" value={balance} disabled={!canEdit||busy} onChange={e=>setBalance(e.target.value)}/></div><div className="field"><label htmlFor="opening-due">Original due date (if known)</label><input id="opening-due" type="date" value={due} disabled={!canEdit||busy} onChange={e=>setDue(e.target.value)}/></div><p>Enter the remaining debt after earlier payments. New credit limits are managed separately in the Credit Book.</p></>:<>
          <div className="grid2"><div className="field"><label htmlFor="opening-quantity">Quantity ({selected?.unit??"base units"})</label><input id="opening-quantity" type="number" min={kind==="finished_goods"?"1":"0.000001"} step={kind==="finished_goods"?"1":"any"} value={quantity} disabled={!canEdit||busy} onChange={e=>setQuantity(e.target.value)}/></div><div className="field"><label htmlFor="opening-cost">Cost per {selected?.unit??"base unit"} (UGX)</label><input id="opening-cost" type="number" min="0" step="any" value={cost} disabled={!canEdit||busy} onChange={e=>setCost(e.target.value)}/></div></div>
          <p>Use cost, not selling price. Count stock in the stated base unit; for example, a 50 kg bag contains 50 kg.</p>{cost!==""&&Number(cost)===0&&<p><b>Zero cost:</b> confirm this is correct before saving.</p>}
        </>}
        <div className="field"><label htmlFor="opening-reference">Reference / notebook / batch (if known)</label><input id="opening-reference" maxLength={200} value={reference} disabled={!canEdit||busy} onChange={e=>setReference(e.target.value)}/></div>
        <div className="field"><label htmlFor="opening-notes">Notes</label><textarea id="opening-notes" maxLength={3000} value={notes} disabled={!canEdit||busy} onChange={e=>setNotes(e.target.value)}/></div>
        <div className="action-row"><button className="btn primary" disabled={!canEdit||busy} onClick={save}>{busy?"Saving…":editing?"Save Draft Changes":"Save Opening Draft"}</button>{editing&&<button className="btn secondary" disabled={busy} onClick={()=>clear()}>Cancel Edit</button>}</div>
      </div>
      <div className="card"><h2 style={{marginTop:0,color:"var(--brown)"}}>Before Entering Balances</h2><p>Choose one opening date for your physical stock count and customer debt list. Use one draft per stock item or customer; update the existing draft if a figure changes.</p><div className="action-row"><a className="btn secondary" href="/inventory">Raw Materials</a><a className="btn secondary" href="/products">Products & Prices</a><a className="btn secondary" href="/customers">Add Customers</a><a className="btn secondary" href="/credit-book">Credit Book</a></div><p>Also confirm supplier debts, starting cash / mobile money / bank balances, selling prices, recipes, staff permissions, business contacts and opening hours before launch.</p></div>
    </div>
    <div className="tablewrap" style={{marginTop:16}}><table><thead><tr><th>Type</th><th>Item / Customer</th><th>Opening Date</th><th>Quantity</th><th>Unit Cost</th><th>Draft Value / Debt</th><th>Due Date</th><th>Reference</th><th>Status</th><th>Actions</th></tr></thead><tbody>{drafts.length===0?<tr><td colSpan={10}>No opening drafts yet. Enter the actual stock and customer debt figures above.</td></tr>:drafts.map(d=><tr key={d.id}>
      <td>{labels[d.kind as Kind]}</td><td><b>{d.raw_materials?.name??d.products?.name??d.customers?.full_name??"Unavailable item"}</b></td><td>{d.as_of_date}</td><td>{d.quantity==null?"—":`${Number(d.quantity).toLocaleString()} ${d.base_unit}`}</td><td>{d.unit_cost==null?"—":ugx(Number(d.unit_cost))}</td><td>{ugx(value(d))}</td><td>{d.due_date??"—"}</td><td>{d.reference??"—"}</td><td><span className={d.voided_at?"badge red":"badge gold"}>{d.voided_at?"VOIDED":"DRAFT — UNPOSTED"}</span></td><td>{permitted(d.kind)?<div className="action-row">{!d.voided_at&&<button className="btn secondary" disabled={busy} onClick={()=>edit(d)}>Edit</button>}<button className="btn secondary" disabled={busy} onClick={()=>correct(d)}>{d.voided_at?"Restore":"Void"}</button></div>:"Read Only"}</td>
    </tr>)}</tbody></table></div>
  </>;
}
