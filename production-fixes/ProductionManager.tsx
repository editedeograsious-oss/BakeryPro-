'use client';

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import RecycleActionButton from "@/components/admin/RecycleActionButton";
import { ugx } from "@/lib/costing";

type CostEntry={packaging:number;labour:number;utilities:number;other:number;waste:number;good:number};

export default function ProductionManager({plan,products,bakers,recipes,live,canManage}:{plan:any[];products:any[];bakers:any[];recipes:any[];live:boolean;canManage:boolean}){
  const router=useRouter();
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const [productId,setProductId]=useState(products[0]?.id??"");
  const [bakerId,setBakerId]=useState(bakers[0]?.id??"");
  const [shift,setShift]=useState("morning");
  const [planned,setPlanned]=useState(0);
  const [notes,setNotes]=useState("");
  const [quantities,setQuantities]=useState<Record<string,number>>({});
  const [costs,setCosts]=useState<Record<string,CostEntry>>({});
  const [usage,setUsage]=useState<Record<string,Record<string,number>>>({});
  const requestIds=useRef<Record<string,string>>({});
  const planRequestId=useRef(crypto.randomUUID());

  const totals=useMemo(()=>({planned:plan.reduce((s,r)=>s+Number(r.planned_qty||0),0),produced:plan.reduce((s,r)=>s+Number(r.produced_qty||0),0)}),[plan]);
  const recipeFor=(product:string)=>recipes.find((r:any)=>r.product_id===product);
  const costFor=(id:string,qty:number):CostEntry=>costs[id]??{packaging:0,labour:0,utilities:0,other:0,waste:0,good:qty};

  async function createPlan(){
    if(!canManage){setMessage("Only CEO / General Manager can create production plans.");return;}
    if(!productId||planned<=0){setMessage("Choose a product and enter planned quantity.");return;}
    if(!live){setMessage("Demo mode: production plan creation simulated.");return;}
    setBusy(true);setMessage("");
    try{const supabase=createClient();const {error}=await supabase.rpc("create_production_plan_item",{p_business_date:null,p_product_id:productId,p_assigned_baker_id:bakerId||null,p_shift:shift,p_planned_qty:planned,p_notes:notes.trim()||null,p_client_request_id:planRequestId.current});if(error)throw error;setMessage("Production plan item created.");planRequestId.current=crypto.randomUUID();setPlanned(0);setNotes("");router.refresh();}catch(e){setMessage(e instanceof Error?e.message:"Could not create plan.");}finally{setBusy(false);}
  }

  function suggestedUsage(row:any,item:any,qty:number){const recipe=recipeFor(row.product_id);if(!recipe||Number(recipe.yield_qty)<=0)return 0;return Number(item.quantity_base_unit||0)/Number(recipe.yield_qty)*qty;}

  async function confirmRun(row:any){
    const qty=Number(quantities[row.id]??0);if(qty<=0){setMessage("Enter a positive produced quantity.");return;}
    const c=costFor(row.id,qty);const good=Number(c.good||qty);const waste=Number(c.waste||0);
    if(good<=0||waste<0||Math.abs((good+waste)-qty)>0.000001){setMessage("Good / sellable quantity + waste quantity must equal total produced quantity.");return;}
    if(!live){setMessage(`Demo mode: ${good} good units and ${waste} waste units confirmed.`);return;}
    const requestId=requestIds.current[row.id]??crypto.randomUUID();requestIds.current[row.id]=requestId;
    const recipe=recipeFor(row.product_id);const actual=(recipe?.recipe_items??[]).map((i:any)=>({raw_material_id:i.raw_material_id,quantity_used_base:Number(usage[row.id]?.[i.raw_material_id]??suggestedUsage(row,i,qty))}));
    setBusy(true);setMessage("");
    try{const supabase=createClient();const {data,error}=await supabase.rpc("confirm_production_run_actual",{p_plan_item_id:row.id,p_quantity_produced:good,p_actual_consumptions:actual,p_process_waste_qty:waste,p_process_waste_reason:waste>0?"Recorded production process waste":null,p_packaging_cost:c.packaging,p_labour_cost:c.labour,p_utilities_cost:c.utilities,p_other_overhead_cost:c.other,p_client_request_id:requestId});if(error)throw error;setMessage(`Production confirmed • run ${data}`);delete requestIds.current[row.id];setQuantities(v=>({...v,[row.id]:0}));router.refresh();}catch(e){setMessage(e instanceof Error?e.message:"Could not confirm production.");}finally{setBusy(false);}
  }

  return <>
    <div className="pagehead"><div><h1>Daily Bake Plan</h1><p>Plan batches, record actual ingredient usage, waste and non-ingredient costs.</p></div><span className={canManage?"badge green":"badge gold"}>{canManage?"Planning Access":"Baker View"}</span></div>
    {message&&<div className="hero" style={{padding:14}}><b>{message}</b></div>}
    <div className="grid4"><div className="card stat"><div className="label">Planned Units</div><div className="value">{totals.planned.toLocaleString()}</div></div><div className="card stat"><div className="label">Produced</div><div className="value">{totals.produced.toLocaleString()}</div></div><div className="card stat"><div className="label">Remaining</div><div className="value">{Math.max(0,totals.planned-totals.produced).toLocaleString()}</div></div><div className="card stat"><div className="label">Completion</div><div className="value">{totals.planned?Math.round(totals.produced/totals.planned*100):0}%</div></div></div>
    {canManage&&<div className="card" style={{marginTop:16}}><h3>Add Production Plan Item</h3><div className="grid2"><div className="field"><label>Product</label><select value={productId} onChange={e=>setProductId(e.target.value)}>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div><div className="field"><label>Assigned baker</label><select value={bakerId} onChange={e=>setBakerId(e.target.value)}><option value="">Unassigned</option>{bakers.map(b=><option key={b.id} value={b.id}>{b.full_name}</option>)}</select></div></div><div className="grid2"><div className="field"><label>Shift</label><select value={shift} onChange={e=>setShift(e.target.value)}><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option></select></div><div className="field"><label>Planned quantity</label><input type="number" min="0.001" step="any" value={planned} onChange={e=>setPlanned(Number(e.target.value))}/></div></div><div className="field"><label>Notes</label><input value={notes} onChange={e=>setNotes(e.target.value)}/></div><button className="btn primary" disabled={busy} onClick={createPlan}>Add to Bake Plan</button></div>}
    <div style={{display:"grid",gap:14,marginTop:16}}>{plan.length===0?<div className="card">No production plan items for today.</div>:plan.map(row=>{const qty=Number(quantities[row.id]??0);const recipe=recipeFor(row.product_id);const c=costFor(row.id,qty);return <div className="card" key={row.id}><div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><div><h3 style={{margin:0}}>{row.product_name}</h3><small>{row.shift} • {row.baker_name??"Unassigned"} • Planned {Number(row.planned_qty)} • Produced {Number(row.produced_qty)}</small></div><span className={row.status==="complete"?"badge green":"badge gold"}>{row.status}</span></div>
      {row.status!=="complete"&&row.status!=="cancelled"&&<><div className="grid2" style={{marginTop:12}}><div className="field"><label>Total produced now</label><input type="number" min="0" value={qty} onChange={e=>setQuantities(v=>({...v,[row.id]:Number(e.target.value)}))}/></div><div className="field"><label>Good / sellable quantity</label><input type="number" min="0" value={c.good} onChange={e=>setCosts(v=>({...v,[row.id]:{...costFor(row.id,qty),good:Number(e.target.value)}}))}/></div></div><div className="field"><label>Waste quantity</label><input type="number" min="0" value={c.waste} onChange={e=>setCosts(v=>({...v,[row.id]:{...costFor(row.id,qty),waste:Number(e.target.value)}}))}/></div>
      {recipe&&<div className="tablewrap"><table><thead><tr><th>Ingredient</th><th>Suggested</th><th>Actual Used</th></tr></thead><tbody>{(recipe.recipe_items??[]).map((i:any)=>{const suggestion=suggestedUsage(row,i,qty);return <tr key={i.raw_material_id}><td>{i.raw_materials?.name??"Ingredient"}</td><td>{suggestion.toFixed(3)} {i.raw_materials?.base_unit??""}</td><td><input type="number" min="0" step="any" value={usage[row.id]?.[i.raw_material_id]??suggestion} onChange={e=>setUsage(v=>({...v,[row.id]:{...(v[row.id]??{}),[i.raw_material_id]:Number(e.target.value)}}))}/></td></tr>})}</tbody></table></div>}
      <div className="grid4" style={{marginTop:12}}>{([['packaging','Packaging'],['labour','Labour'],['utilities','Utilities'],['other','Other']] as const).map(([key,label])=><div className="field" key={key}><label>{label} cost (UGX)</label><input type="number" min="0" value={c[key]} onChange={e=>setCosts(v=>({...v,[row.id]:{...costFor(row.id,qty),[key]:Number(e.target.value)}}))}/></div>)}</div><div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}><button className="btn primary" disabled={busy} onClick={()=>confirmRun(row)}>Confirm Actual Production</button>{canManage&&Number(row.produced_qty||0)===0&&<RecycleActionButton entityType="production_plan_item" entityId={row.id} label={`${row.product_name} production plan`} live={live}/>}<small>Extra batch costs: {ugx(c.packaging+c.labour+c.utilities+c.other)}</small></div></>}
    </div>})}</div>
  </>;
}
