"use client";

import {useState} from "react";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase/client";

type Product={id:string;name:string;status:string;selling_price:number};
const dateEAT=()=>new Intl.DateTimeFormat("sv-SE",{
  timeZone:"Africa/Kampala",year:"numeric",month:"2-digit",day:"2-digit"
}).format(new Date());

export default function FinishedStockIn({products}:{products:Product[]}){
  const router=useRouter();
  const [productId,setProductId]=useState(products.find(p=>p.status==="active")?.id??"");
  const [quantity,setQuantity]=useState("");
  const [unitCost,setUnitCost]=useState("");
  const [stockDate,setStockDate]=useState(dateEAT);
  const [reason,setReason]=useState("");
  const [requestId,setRequestId]=useState(()=>crypto.randomUUID());
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [saved,setSaved]=useState(false);

  async function save(){
    if(busy)return;
    const qty=Number(quantity);
    const cost=Number(unitCost);
    if(!productId){setMessage("Choose the finished product.");return;}
    if(!quantity.trim()||!Number.isSafeInteger(qty)||qty<=0||qty>100000){
      setMessage("Enter a positive whole number of finished items.");return;
    }
    if(!unitCost.trim()||!Number.isFinite(cost)||cost<=0||cost>100000000){
      setMessage("Enter the actual positive cost per finished item in UGX.");return;
    }
    if(!/^\d{4}-\d{2}-\d{2}$/.test(stockDate) || stockDate>dateEAT()){
      setMessage("Choose a valid stock date, not in the future.");return;
    }
    if(reason.trim().length<10||reason.trim().length>300){
      setMessage("Enter 10–300 characters explaining where this stock came from.");return;
    }
    setBusy(true);setMessage("");
    try{
      const {data,error}=await createClient().rpc("owner_add_finished_stock",{
        p_product_id:productId,
        p_quantity:qty,
        p_unit_cost:cost,
        p_stock_date:stockDate,
        p_reason:reason.trim(),
        p_client_request_id:requestId,
      });
      if(error)throw error;
      setSaved(true);
      setMessage("Stock saved. "+qty+" unit(s) added to Finished Goods and POS availability. Batch ID: "+data);
      setQuantity("");setUnitCost("");setReason("");setRequestId(crypto.randomUUID());
      router.refresh();
    }catch(err){
      setSaved(false);
      const e=err as {message?:string;hint?:string;details?:string};
      setMessage("STOCK NOT SAVED: "+(e?.message??"Unable to save finished stock.")+(e?.hint?" "+e.hint:""));
    }finally{setBusy(false)}
  }

  return <section className="card" style={{padding:20,marginBottom:20}}>
    <h2 style={{marginTop:0}}>+ Add Finished Stock</h2>
    <p>For <strong>existing baked products or opening stock</strong> that was physically counted.
      Normal daily baking should still be recorded in the Daily Bake Plan.
      This entry is separate from a production run and is permanently auditable.</p>
    <div className="grid2">
      <div className="field">
        <label htmlFor="manual-stock-product">Finished product</label>
        <select id="manual-stock-product" value={productId} onChange={e=>setProductId(e.target.value)}>
          <option value="">Select product</option>
          {products.filter(p=>p.status==="active").map(p=>
            <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="manual-stock-qty">Quantity (pieces)</label>
        <input id="manual-stock-qty" type="number" inputMode="numeric" min={1} step={1}
          placeholder="e.g. 20" value={quantity}
          onChange={e=>setQuantity(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="manual-stock-cost">Actual unit cost (UGX)</label>
        <input id="manual-stock-cost" type="number" inputMode="decimal" min={0.01} step={0.01}
          placeholder="e.g. 2000" value={unitCost}
          onChange={e=>setUnitCost(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="manual-stock-date">Date stock was available (EAT)</label>
        <input id="manual-stock-date" type="date" value={stockDate} max={dateEAT()}
          onChange={e=>setStockDate(e.target.value)} />
      </div>
    </div>
    <div className="field">
      <label htmlFor="manual-stock-reason">Source / reason for adding stock</label>
      <textarea id="manual-stock-reason" rows={2} maxLength={300}
        value={reason} onChange={e=>setReason(e.target.value)}
        placeholder="e.g. Opening stock counted before using DS Bakery POS"/>
    </div>
    <p style={{fontSize:13}}>
      Stock cost: <strong>UGX {(Number(quantity||0)*Number(unitCost||0)).toLocaleString("en-US")}</strong>.
      This is inventory cost, not cash income. A sale will deduct the corresponding items from finished stock.
    </p>
    <button type="button" className="btn primary" disabled={busy||products.length===0} onClick={save}>
      {busy?"Saving stock…":"Save Finished Stock"}
    </button>
    {message&&<div role={saved?"status":"alert"}
      style={{marginTop:12,padding:12,borderRadius:8,
        border:"1px solid "+(saved?"#7aa17b":"#b85a50"),
        background:saved?"#f2faf3":"#fff1ee"}}>{message}</div>}
  </section>;
}
