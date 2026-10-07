'use client';

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ugx } from "@/lib/costing";
import RecycleActionButton from "@/components/admin/RecycleActionButton";

export default function InventoryManager({materials,suppliers,live,canAdjust,canPrepareOpening=false,canPostMovements=true}:{materials:any[];suppliers:any[];live:boolean;canAdjust:boolean;canPrepareOpening?:boolean;canPostMovements?:boolean}){
  const router=useRouter();
  const [selected,setSelected]=useState(materials[0]?.id??"");
  const material=materials.find((m:any)=>m.id===selected);
  const [counted,setCounted]=useState(material?Number(material.current_stock_qty):0);
  const [reason,setReason]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const requestId=useRef(crypto.randomUUID());

  const [editing,setEditing]=useState<any|null>(null);
  const [showMaterialForm,setShowMaterialForm]=useState(false);
  const [matName,setMatName]=useState("");const [sku,setSku]=useState("");const [baseUnit,setBaseUnit]=useState("kg");
  const [supplierId,setSupplierId]=useState("");const [packLabel,setPackLabel]=useState("");const [packQty,setPackQty]=useState(1);const [lowThreshold,setLowThreshold]=useState(0);

  const low=useMemo(()=>materials.filter((m:any)=>m.low||Number(m.current_stock_qty)<=Number(m.low_stock_threshold)),[materials]);
  const stockValue=useMemo(()=>materials.reduce((s:number,m:any)=>s+Number(m.stock_value??0),0),[materials]);

  function choose(id:string){setSelected(id);const m=materials.find((x:any)=>x.id===id);setCounted(m?Number(m.current_stock_qty):0);setReason("");}
  function clearMaterial(){setEditing(null);setMatName("");setSku("");setBaseUnit("kg");setSupplierId("");setPackLabel("");setPackQty(1);setLowThreshold(0);setShowMaterialForm(false);}
  function addMaterial(){clearMaterial();setShowMaterialForm(true);}
  function editMaterial(m:any){setEditing(m);setMatName(m.name??"");setSku(m.sku??"");setBaseUnit(m.base_unit??"kg");setSupplierId(m.supplier_id??"");setPackLabel(m.purchase_pack_label??"");setPackQty(Number(m.purchase_pack_base_qty??1));setLowThreshold(Number(m.low_stock_threshold??0));setShowMaterialForm(true);window.scrollTo({top:0,behavior:"smooth"});}

  async function saveMaterial(){
    if(!matName.trim()||!baseUnit.trim()||packQty<=0||lowThreshold<0){setMessage("Complete the material name, unit, pack quantity and reorder level correctly.");return;}
    if(!live){setMessage("Demo mode: material save simulated.");return;}
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {error}=await supabase.rpc("save_raw_material",{p_raw_material_id:editing?.id??null,p_supplier_id:supplierId||null,p_name:matName.trim(),p_sku:sku.trim()||null,p_base_unit:baseUnit.trim(),p_purchase_pack_label:packLabel.trim()||null,p_purchase_pack_base_qty:packQty,p_low_stock_threshold:lowThreshold});
      if(error)throw error;
      setMessage(editing?"Raw material updated.":"Raw material added.");clearMaterial();router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not save raw material.");}finally{setBusy(false);}
  }

  async function saveCount(){
    if(!canPostMovements){setMessage("Stock movements are locked. Prepare opening stock as a draft first.");return;}
    if(!material)return;if(counted<0){setMessage("Counted stock cannot be negative.");return;}if(!reason.trim()){setMessage("Enter a reason for the stock count adjustment.");return;}
    if(!live){setMessage("Demo mode: stock count simulated.");return;}
    setBusy(true);setMessage("");
    try{const supabase=createClient();const {error}=await supabase.rpc("record_stock_count",{p_raw_material_id:selected,p_counted_qty:counted,p_reason:reason.trim(),p_client_request_id:requestId.current});if(error)throw error;setMessage("Stock count posted to the movement ledger.");requestId.current=crypto.randomUUID();router.refresh();}
    catch(e){setMessage(e instanceof Error?e.message:"Could not save stock count.");}finally{setBusy(false);}
  }

  return <>
    <div className="pagehead"><div><h1>Raw Materials & Inventory</h1><p>Manage material setup, reorder levels and controlled stock movements.</p></div><div className="action-row">{canAdjust&&<button className="btn secondary" onClick={showMaterialForm?clearMaterial:addMaterial}>{showMaterialForm?"Cancel":"+ Raw Material"}</button>}{canPrepareOpening&&<a className="btn secondary" href="/opening-balances">Opening Stock Drafts</a>}{canAdjust?<a className="btn primary" href="/purchases">New Purchases & Receiving</a>:<span className="badge gold">Read Only</span>}</div></div>
    {!canPostMovements&&<div className="hero" style={{padding:14,marginBottom:16}}>Live stock movements are locked. Register raw materials here and prepare counted quantities and costs in Opening Stock Drafts.</div>}
    {message&&<div className="hero" style={{padding:14}}><b>{message}</b></div>}

    {canAdjust&&showMaterialForm&&<div className="card" style={{marginBottom:16}}><h3 style={{color:"var(--brown)",marginTop:0}}>{editing?"Edit Raw Material":"New Raw Material"}</h3>
      <div className="grid2"><div className="field"><label>Name</label><input value={matName} onChange={e=>setMatName(e.target.value)}/></div><div className="field"><label>Supplier</label><select value={supplierId} onChange={e=>setSupplierId(e.target.value)}><option value="">No default supplier</option>{suppliers.map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div></div>
      <div className="grid3"><div className="field"><label>SKU</label><input value={sku} onChange={e=>setSku(e.target.value)}/></div><div className="field"><label>Base unit</label><input value={baseUnit} onChange={e=>setBaseUnit(e.target.value)} placeholder="kg / g / L / pcs"/></div><div className="field"><label>Low-stock level</label><input type="number" min="0" value={lowThreshold} onChange={e=>setLowThreshold(Number(e.target.value))}/></div></div>
      <div className="grid2"><div className="field"><label>Purchase pack label</label><input value={packLabel} onChange={e=>setPackLabel(e.target.value)} placeholder="50 kg bag / carton"/></div><div className="field"><label>Pack quantity in base units</label><input type="number" min="0.000001" step="any" value={packQty} onChange={e=>setPackQty(Number(e.target.value))}/></div></div>
      <button className="btn primary" disabled={busy} onClick={saveMaterial}>{busy?"Saving…":editing?"Save Material Changes":"Save Raw Material"}</button>
    </div>}

    <div className="grid4"><div className="card stat"><div className="label">Raw Materials</div><div className="value">{materials.length}</div></div><div className="card stat"><div className="label">Low Stock</div><div className="value">{low.length}</div></div><div className="card stat"><div className="label">Stock Value</div><div className="value">{ugx(stockValue)}</div></div><div className="card stat"><div className="label">Ledger Control</div><div className="value" style={{fontSize:20}}>Active</div></div></div>
    <div className="grid2" style={{marginTop:16}}><div className="card"><h3 style={{color:"var(--brown)",marginTop:0}}>Low-stock alerts</h3>{low.length===0?<p style={{color:"var(--muted)"}}>No materials below reorder level.</p>:low.slice(0,8).map((m:any)=><p key={m.id}><b>{m.name}</b> — {Number(m.current_stock_qty).toLocaleString()} {m.base_unit} <span className="badge red">Below {Number(m.low_stock_threshold).toLocaleString()} {m.base_unit}</span></p>)}</div>
      <div className="card"><h3 style={{color:"var(--brown)",marginTop:0}}>{canAdjust?"Stock Count Adjustment":"Inventory Access"}</h3>{canAdjust?<><div className="field"><label>Material</label><select value={selected} onChange={e=>choose(e.target.value)}>{materials.map((m:any)=><option key={m.id} value={m.id}>{m.name}</option>)}</select></div><div className="field"><label>Counted quantity ({material?.base_unit??"base unit"})</label><input type="number" min="0" step="any" value={counted} onChange={e=>setCounted(Number(e.target.value))}/></div><div className="field"><label>Reason</label><input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Physical count / correction reason"/></div><button className="btn secondary" disabled={busy||!material||!canPostMovements} onClick={saveCount}>{busy?"Posting…":"Post Stock Count"}</button></>:<p style={{color:"var(--muted)",lineHeight:1.6}}>Your role can view ingredient stock and reorder levels but cannot post stock-count adjustments or receive purchases.</p>}</div></div>
    <div className="tablewrap" style={{marginTop:16}}><table><thead><tr><th>Material</th><th>Supplier</th><th>Unit</th><th>Current Unit Cost</th><th>Stock</th><th>Reorder</th><th>Stock Value</th><th>Actions</th></tr></thead><tbody>{materials.length===0?<tr><td colSpan={8}>No materials found.</td></tr>:materials.map((m:any)=><tr key={m.id}><td><b>{m.name}</b><br/><small>{m.sku??""}</small></td><td>{m.supplier_name??"—"}</td><td>{m.base_unit}</td><td>{ugx(Number(m.unit_cost??0))}/{m.base_unit}</td><td>{Number(m.current_stock_qty).toLocaleString()} {m.base_unit}</td><td>{Number(m.low_stock_threshold).toLocaleString()} {m.base_unit}</td><td>{ugx(Number(m.stock_value??0))}</td><td>{canAdjust?<div className="action-row"><button className="btn secondary" onClick={()=>editMaterial(m)}>Edit</button><RecycleActionButton entityType="raw_material" entityId={m.id} label={m.name} live={live} onMessage={setMessage}/></div>:<span className={m.low?"badge red":"badge green"}>{m.low?"Low":"OK"}</span>}</td></tr>)}</tbody></table></div>
  </>;
}
