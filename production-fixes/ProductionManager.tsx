'use client';

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import RecycleActionButton from "@/components/admin/RecycleActionButton";

export default function ProductionManager({
  plan,products,bakers,live,canManage,recipeIngredients
}:{
  plan:any[];products:any[];bakers:any[];live:boolean;canManage:boolean;recipeIngredients:any[];
}){
  const router=useRouter();
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const [productId,setProductId]=useState(products[0]?.id??"");
  const [bakerId,setBakerId]=useState(bakers[0]?.id??"");
  const [shift,setShift]=useState("morning");
  const [planned,setPlanned]=useState(0);
  const [notes,setNotes]=useState("");
  const [quantities,setQuantities]=useState<Record<string,number>>({});
  const [wasteQty,setWasteQty]=useState<Record<string,number>>({});
  const [wasteReason,setWasteReason]=useState<Record<string,string>>({});
  const [actualUsage,setActualUsage]=useState<Record<string,Record<string,number>>>({});
  const requestIds=useRef<Record<string,string>>({});
  const planRequestId=useRef(crypto.randomUUID());

  const totals=useMemo(()=>({
    planned:plan.reduce((s,r)=>s+Number(r.planned_qty||0),0),
    produced:plan.reduce((s,r)=>s+Number(r.produced_qty||0),0),
  }),[plan]);

  async function createPlan(){
    if(!canManage){setMessage("Only Owner/Manager can create production plans.");return;}
    if(!productId||planned<=0){setMessage("Choose a product and enter planned quantity.");return;}
    if(!live){setMessage("Demo mode: production plan creation simulated.");return;}
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {error}=await supabase.rpc("create_production_plan_item",{
        p_business_date:null,
        p_product_id:productId,
        p_assigned_baker_id:bakerId||null,
        p_shift:shift,
        p_planned_qty:planned,
        p_notes:notes.trim()||null,
        p_client_request_id:planRequestId.current,
      });
      if(error)throw error;
      setMessage("Production plan item created.");
      planRequestId.current=crypto.randomUUID();
      setPlanned(0);setNotes("");
      router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not create plan.");}
    finally{setBusy(false);}
  }

  async function confirmRun(id:string){
    const qty=Number(quantities[id]??0);
    if(qty<=0){setMessage("Enter a positive produced quantity.");return;}
    if(!live){setMessage("Demo mode: production confirmation simulated.");return;}

    const requestId=requestIds.current[id]??crypto.randomUUID();
    requestIds.current[id]=requestId;

    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const row=plan.find(x=>x.id===id);
      const ingredients=recipeIngredients.filter((x:any)=>x.product_id===row?.product_id);
      const actual=ingredients.map((x:any)=>({raw_material_id:x.raw_material_id,quantity_used_base:Number(actualUsage[id]?.[x.raw_material_id]??0)})).filter((x:any)=>x.quantity_used_base>0);
      const {data,error}=await supabase.rpc("confirm_production_run_actual",{
        p_plan_item_id:id,p_quantity_produced:qty,p_actual_consumptions:actual.length?actual:null,
        p_process_waste_qty:Number(wasteQty[id]??0),p_process_waste_reason:wasteReason[id]?.trim()||null,
        p_packaging_cost:null,p_labour_cost:null,p_utilities_cost:null,p_other_overhead_cost:null,p_client_request_id:requestId,
      });
      if(error)throw error;
      setMessage(`Production confirmed • run ${data}`);
      delete requestIds.current[id];
      setQuantities(prev=>({...prev,[id]:0}));setWasteQty(prev=>({...prev,[id]:0}));setWasteReason(prev=>({...prev,[id]:""}));setActualUsage(prev=>({...prev,[id]:{}}));
      router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not confirm production.");}
    finally{setBusy(false);}
  }

  return <>
    <div className="pagehead">
      <div><h1>Daily Bake Plan</h1><p>Actual ingredient usage, production loss and true batch costing feed finished-goods stock automatically.</p></div>
      <span className={canManage?"badge green":"badge gold"}>{canManage?"Planning Access":"Baker View"}</span>
    </div>

    {message&&<div className="hero" style={{padding:14}}><b>{message}</b></div>}

    <div className="grid4">
      <div className="card stat"><div className="label">Planned Units</div><div className="value">{totals.planned.toLocaleString()}</div></div>
      <div className="card stat"><div className="label">Produced</div><div className="value">{totals.produced.toLocaleString()}</div></div>
      <div className="card stat"><div className="label">Remaining</div><div className="value">{Math.max(0,totals.planned-totals.produced).toLocaleString()}</div></div>
      <div className="card stat"><div className="label">Completion</div><div className="value">{totals.planned?Math.round(totals.produced/totals.planned*100):0}%</div></div>
    </div>

    {canManage&&<div className="card" style={{marginTop:16}}>
      <h3 style={{color:"var(--brown)",marginTop:0}}>Add Production Plan Item</h3>
      <div className="grid2">
        <div className="field"><label>Product</label><select value={productId} onChange={e=>setProductId(e.target.value)}>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <div className="field"><label>Assigned baker</label><select value={bakerId} onChange={e=>setBakerId(e.target.value)}><option value="">Unassigned</option>{bakers.map(b=><option key={b.id} value={b.id}>{b.full_name}</option>)}</select></div>
      </div>
      <div className="grid2">
        <div className="field"><label>Shift</label><select value={shift} onChange={e=>setShift(e.target.value)}><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option></select></div>
        <div className="field"><label>Planned quantity</label><input type="number" min="0.001" step="any" value={planned} onChange={e=>setPlanned(Number(e.target.value))}/></div>
      </div>
      <div className="field"><label>Notes</label><input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Production note"/></div>
      <button className="btn primary" disabled={busy} onClick={createPlan}>{busy?"Working…":"Add to Bake Plan"}</button>
    </div>}

    <div className="tablewrap" style={{marginTop:16}}>
      <table><thead><tr><th>Product</th><th>Shift</th><th>Planned</th><th>Produced</th><th>Remaining</th><th>Baker</th><th>Status</th><th>Confirm Run / Delete</th></tr></thead>
      <tbody>{plan.length===0?<tr><td colSpan={8}>No production plan items for today.</td></tr>:plan.map(r=><tr key={r.id}>
        <td><b>{r.product_name}</b></td><td>{String(r.shift).replace("_"," ")}</td><td>{Number(r.planned_qty).toLocaleString()}</td><td>{Number(r.produced_qty).toLocaleString()}</td><td>{Number(r.remaining_qty).toLocaleString()}</td><td>{r.baker_name??"Unassigned"}</td>
        <td><span className={r.status==="complete"?"badge green":"badge gold"}>{r.status}</span></td>
        <td>{r.status==="complete"||r.status==="cancelled"?<span style={{color:"var(--muted)"}}>Closed</span>:<div style={{minWidth:300}}><div className="action-row"><input type="number" min="0.001" step="any" style={{maxWidth:95}} title="Good sellable units" value={quantities[r.id]??0} onChange={e=>setQuantities(prev=>({...prev,[r.id]:Number(e.target.value)}))}/><input type="number" min="0" step="any" style={{maxWidth:90}} title="Process waste units" placeholder="Waste" value={wasteQty[r.id]??0} onChange={e=>setWasteQty(prev=>({...prev,[r.id]:Number(e.target.value)}))}/><button className="btn secondary" disabled={busy} onClick={()=>confirmRun(r.id)}>Confirm</button>{canManage&&Number(r.produced_qty||0)===0&&<RecycleActionButton entityType="production_plan_item" entityId={r.id} label={`${r.product_name} production plan`} live={live}/>}</div><input style={{marginTop:6,width:"100%"}} placeholder="Waste reason (if any)" value={wasteReason[r.id]??""} onChange={e=>setWasteReason(prev=>({...prev,[r.id]:e.target.value}))}/>{recipeIngredients.filter((x:any)=>x.product_id===r.product_id).length>0&&<details style={{marginTop:6}}><summary style={{cursor:"pointer",fontWeight:700}}>Actual ingredient usage (optional)</summary>{recipeIngredients.filter((x:any)=>x.product_id===r.product_id).map((x:any)=><div className="grid2" key={x.raw_material_id}><small>{x.ingredient_name} ({x.base_unit})</small><input type="number" min="0" step="any" placeholder="Leave blank to use recipe standard" value={actualUsage[r.id]?.[x.raw_material_id]??""} onChange={e=>setActualUsage(prev=>({...prev,[r.id]:{...(prev[r.id]??{}),[x.raw_material_id]:Number(e.target.value)}}))}/></div>)}</details>}</div>}</td>
      </tr>)}</tbody></table>
    </div>

    <div className="hero" style={{marginTop:16}}>
      <h2>Atomic production</h2>
      <p>The database checks branch stock before posting. Actual ingredient usage may override the recipe standard, while packaging, labour, utilities and overhead come from the product true-cost profile unless management overrides them.</p>
    </div>
  </>;
}
