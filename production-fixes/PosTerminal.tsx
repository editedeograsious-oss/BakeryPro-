"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import Sidebar from "@/components/Sidebar";
import {createClient} from "@/lib/supabase/client";
import {subtotal,discountAmount,grandTotal,changeDue,type CartLine} from "@/lib/pos";
import {ugx} from "@/lib/costing";

type PaymentMethod="cash"|"mtn_momo"|"airtel_money"|"customer_credit";
type Sale={id:string;sale_no:string|null;total:number|string;created_at:string;status:string;held:boolean;cashier_id:string|null};
function sanitizeAmount(raw:string){let value=raw.replace(/[^0-9.]/g,"");let [whole,...frac]=value.split(".");whole=whole.replace(/^0+(?=\d)/,"");if(value.startsWith("."))whole="0";return frac.length?whole+"."+frac.join("").slice(0,2):whole;}
function amount(raw:string){const n=Number(raw);return Number.isFinite(n)&&n>=0?n:0;}
function describeSaleError(error:unknown):string {
  const obj=(error && typeof error==="object"?error:null) as {message?:unknown;details?:unknown;hint?:unknown;code?:unknown}|null;
  const message=typeof obj?.message==="string"?obj.message:(error instanceof Error?error.message:typeof error==="string"?error:"Unable to reach the shared sales database.");
  const details=typeof obj?.details==="string" && obj.details!==message ? obj.details : "";
  const hint=typeof obj?.hint==="string" ? obj.hint : "";
  if(/insufficient finished-goods stock/i.test(message)){
    return "Not enough finished goods have been recorded. Confirm production and stock batches before selling. "+message;
  }
  if(/open cashier shift required/i.test(message))return "Open your cashier shift before saving a sale.";
  if(/invalid refresh token|jwt expired|invalid jwt/i.test(message))return "Your login has expired. Please sign out and sign in again before posting a sale.";
  return [message,details,hint].filter(Boolean).join(" — ");
}
function MoneyInput({value,onChange,label,kind="money"}:{value:string;onChange:(value:string)=>void;label:string;kind?:"money"|"percent"}){
  return <div className="field"><label>{label}</label><input type="text" inputMode="decimal" autoComplete="off"
    aria-label={label} placeholder={kind==="money"?"Enter amount in UGX":"Enter percentage"}
    value={value} onChange={e=>onChange(sanitizeAmount(e.target.value))}
    onFocus={e=>e.currentTarget.select()} /></div>;
}
export default function PosTerminal({products,openShift,customers,live,canPost=true}:{products:any[];openShift:any|null;customers:any[];live:boolean;canPost?:boolean}){
  const router=useRouter();
  const [cart,setCart]=useState<CartLine[]>([]);
  const [discountType,setDiscountType]=useState<"amount"|"percent">("amount");
  const [discountText,setDiscountText]=useState("");
  const [paymentMethod,setPaymentMethod]=useState<PaymentMethod>("cash");
  const [receivedText,setReceivedText]=useState("");
  const [reference,setReference]=useState("");
  const [approvalPin,setApprovalPin]=useState("");
  const [customerId,setCustomerId]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const [stock,setStock]=useState<Record<string,number>>(()=>Object.fromEntries(products.map((p:any)=>[String(p.id),Number(p.available_qty??0)])));
  const [stockStatus,setStockStatus]=useState("");
  const [sales,setSales]=useState<Sale[]>([]);
  const [historyStatus,setHistoryStatus]=useState("");
  const [syncAt,setSyncAt]=useState("");
  const requestId=useRef(crypto.randomUUID());
  const sub=useMemo(()=>subtotal(cart),[cart]);
  const disc=useMemo(()=>discountAmount(sub,discountType,amount(discountText)),[sub,discountType,discountText]);
  const total=useMemo(()=>grandTotal(sub,disc),[sub,disc]);
  const received=amount(receivedText);
  const change=paymentMethod==="cash"?changeDue(received,total):0;
  const selectedCustomer=customers.find((c:any)=>(c.id??c.customer_id)===customerId);
  function addProduct(p:any){
    const available=stock[p.id]??0;
    const current=cart.find(x=>x.productId===p.id)?.quantity??0;
    if(current>=available){setMessage("Cannot add "+p.name+": "+available+" unit(s) recorded as sellable finished goods. Record a completed production batch first.");return;}
    setCart(prev=>{const found=prev.find(x=>x.productId===p.id);return found?prev.map(x=>x.productId===p.id?{...x,quantity:x.quantity+1}:x):[...prev,{productId:p.id,name:p.name,unitPrice:Number(p.selling_price),quantity:1}];});
    setMessage("");
  }
  function updateQty(id:string,delta:number){
    const item=cart.find(x=>x.productId===id);
    if(delta>0&&item&&item.quantity>=Number(stock[id]??0)){setMessage("Cannot increase "+item.name+" above available finished stock ("+Number(stock[id]??0)+").");return;}
    setCart(prev=>prev.map(x=>x.productId===id?{...x,quantity:Math.max(0,x.quantity+delta)}:x).filter(x=>x.quantity>0));
  }
  async function refreshStock(){
    if(!live)return;
    const {data,error}=await createClient().rpc("pos_available_finished_stock");
    if(error){setStockStatus("Could not refresh stock: "+error.message);return;}
    if(!Array.isArray(data)){setStockStatus("Stock check returned an unexpected result.");return;}
    setStock(Object.fromEntries(data.map((r:any)=>[String(r.product_id),Number(r.available_quantity??0)])));
    setStockStatus("");
  }

  async function refreshSales(){
    if(!live)return;
    const sb=createClient();
    const {data,error}=await sb.from("sales")
      .select("id,sale_no,total,created_at,status,held,cashier_id")
      .order("created_at",{ascending:false}).limit(25);
    if(error){setHistoryStatus("Could not sync sales: "+error.message);return;}
    setSales(data??[]);
    setSyncAt(new Date().toLocaleTimeString());
    setHistoryStatus("");
  }
  useEffect(()=>{
    if(!live)return;
    const supabase=createClient();
    let active=true;
    void refreshSales();
    void refreshStock();
    const handler=()=>{if(active&&document.visibilityState==="visible"){void refreshSales();void refreshStock();}};
    const interval=window.setInterval(handler,15000);
    document.addEventListener("visibilitychange",handler);
    const handleSharedChange=(event:Event)=>{
      const module=String((event as CustomEvent<{module?:string}>).detail?.module??"");
      if(["inventory","catalog","sales","orders","production"].includes(module))handler();
    };
    window.addEventListener("ds-bakery:shared-change",handleSharedChange);
    const channel=supabase.channel("bakery-pos-sales")
      .on("postgres_changes",{event:"*",schema:"public",table:"sales"},()=>{if(active)void refreshSales();})
      .subscribe();
    return()=>{active=false;window.clearInterval(interval);document.removeEventListener("visibilitychange",handler);window.removeEventListener("ds-bakery:shared-change",handleSharedChange);void supabase.removeChannel(channel);};
  },[live]);

  async function submit(hold:boolean){
    if(busy)return;
    if(!cart.length){setMessage("Add at least one product.");return;}
    if(!openShift){setMessage("Open your cashier shift before posting sales.");return;}
    const insufficient=cart.find(line=>line.quantity>Number(stock[line.productId]??0));
    if(insufficient){
      setMessage("SALE NOT SAVED: "+insufficient.name+" needs "+insufficient.quantity+" unit(s) but only "+Number(stock[insufficient.productId]??0)+" is recorded as finished stock. Confirm production at Finished Goods before posting.");
      return;
    }
    if(!hold && paymentMethod==="cash"&&received<total){setMessage("Cash received is less than the total.");return;}
    if(!hold && ["mtn_momo","airtel_money"].includes(paymentMethod)&&!reference.trim()){setMessage("Enter the Mobile Money transaction reference.");return;}
    if(!hold&&paymentMethod==="customer_credit"&&!customerId){setMessage("Select a customer for a credit sale.");return;}
    if(!hold&&paymentMethod==="customer_credit"&&!selectedCustomer?.credit_enabled){setMessage("Customer credit is not enabled.");return;}
    if(!hold&&paymentMethod==="customer_credit"&&Number(selectedCustomer?.available_credit??0)<total){setMessage("Not enough available customer credit.");return;}
    if(!live){setMessage("Demo mode: NO SALE SAVED to shared cloud records.");return;}
    if(!canPost){setMessage("SALE NOT SAVED: live operations are locked. Ask the CEO to complete go-live validation.");return;}
    setBusy(true);setMessage("Saving the sale to shared records…");
    try{
      const sb=createClient();
      const argumentsBase={p_items:cart.map(x=>({product_id:x.productId,quantity:x.quantity})),p_discount:disc,p_notes:null,p_client_request_id:requestId.current};
      const {data,error}=(!hold&&paymentMethod==="customer_credit")
        ?await sb.rpc("complete_credit_sale_controlled",{...argumentsBase,p_customer_id:customerId,p_approval_pin:approvalPin.trim()||null})
        :await sb.rpc("complete_sale_v038",{
            p_items:argumentsBase.p_items,p_manual_discount:disc,p_promo_code:null,p_notes:null,p_client_request_id:requestId.current,
            p_payments:hold?[]:[{method:paymentMethod,amount:total,reference:paymentMethod==="cash"?null:reference.trim()}],
            p_hold:hold,p_customer_id:customerId||null,p_approval_pin:approvalPin.trim()||null
          });
      if(error)throw error;
      const saleId=typeof data==="string"?data:typeof data==="object"?data?.sale_id??data?.id??null:null;
      let receipt=typeof data==="object"&&data?.sale_no?String(data.sale_no):saleId??String(data);
      let verified=false;
      if(saleId){
        try{
          const result=await sb.from("sales").select("sale_no,total,status").eq("id",saleId).maybeSingle();
          if(!result.error&&result.data){
            verified=true;
            receipt=result.data.sale_no||receipt;
          }
        }catch{ /* The RPC can succeed even if the subsequent read temporarily fails. */ }
      }
      setMessage((hold?"Sale held":"Sale completed")+" and SAVED to shared staging cloud records. Receipt: "+receipt+
        (verified?" • Verified in central sales database.":" • If it does not appear in history, use Refresh Sales; do not repost without checking."));
      requestId.current=crypto.randomUUID();
      setApprovalPin("");
      if(!hold){setCart([]);setDiscountText("");setReceivedText("");setReference("");setCustomerId("");}
      await refreshSales();await refreshStock();router.refresh();
    }catch(error){
      setMessage("SALE NOT SAVED: "+describeSaleError(error));
    }finally{setBusy(false);}
  }

  return <div className="shell"><Sidebar/><main className="main">
    <div className="pagehead"><div><h1>Cashier POS</h1><p>Shared cloud sales with clear save confirmation and automatically refreshed records.</p></div>
      <div className="action-row"><span className={openShift?"badge green":"badge red"}>{openShift?"Shift Open":"No Open Shift"}</span>
      <button className="btn secondary" disabled={busy||!live||!canPost} onClick={()=>submit(true)}>Hold Sale</button>
      <button className="btn secondary" disabled={busy} onClick={()=>setCart([])}>Clear Cart</button></div></div>
    {!live&&<div className="hero"><strong>Demo mode:</strong> this screen cannot save actual shared sales.</div>}
    {live&&!canPost&&<div className="hero" role="alert"><strong>Live sales are locked.</strong> Entries here cannot be posted until the CEO completes the protected go-live process. Saved sales will not appear in reports until posting succeeds.</div>}
    {message&&<div className="hero" role="status" style={{padding:14,marginBottom:14}}><b>{message}</b></div>}
    {!openShift&&<div className="hero"><strong>Cashier shift required.</strong> <a href="/shifts">Open your shift before selling</a>.</div>}
    <div className="grid2">
      <section className="card">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
          <h3>Products</h3><button type="button" className="btn secondary" onClick={()=>void refreshStock()}>Refresh Stock</button>
        </div>
        <p style={{fontSize:12}}>Only finished bakery goods recorded through Production can be sold. <a href="/finished-goods">View finished goods</a>.</p>
        {stockStatus&&<p role="alert">{stockStatus}</p>}
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10}}>
        {products.map(p=><button type="button" key={p.id} className="btn secondary" onClick={()=>addProduct(p)}
          disabled={Number(stock[p.id]??0)<=0}
          title={Number(stock[p.id]??0)<=0?"No recorded finished stock. Complete production before selling.":undefined}
          style={{minHeight:83,textAlign:"left"}}>
          <strong>{p.name}</strong><div>{p.category_name}</div>
          <small>{ugx(Number(p.selling_price))}</small>
          <div style={{marginTop:4,fontSize:12,fontWeight:700,color:Number(stock[p.id]??0)>0?"#21754b":"#aa3e2d"}}>
            {Number(stock[p.id]??0)>0?"Available: "+Number(stock[p.id]).toLocaleString()+" unit(s)":"Out of stock — record production"}
          </div>
        </button>)}
        </div>
      </section>
      <section className="card"><h3>Current Sale</h3>
      {cart.length===0?<p>Tap a product to begin.</p>:<div className="tablewrap"><table><thead><tr><th>Product</th><th>Qty</th><th>Total</th></tr></thead>
      <tbody>{cart.map(line=><tr key={line.productId}><td>{line.name}<small style={{display:"block"}}>{ugx(line.unitPrice)} each</small></td>
        <td><div className="action-row"><button className="btn secondary" onClick={()=>updateQty(line.productId,-1)}>−</button><strong>{line.quantity}</strong><button className="btn secondary" onClick={()=>updateQty(line.productId,1)}>+</button></div></td>
        <td>{ugx(line.unitPrice*line.quantity)}</td></tr>)}</tbody></table></div>}
      <div className="grid2"><div className="field"><label>Discount type</label><select value={discountType} onChange={e=>{setDiscountType(e.target.value as "amount"|"percent");setDiscountText("");}}><option value="amount">Amount (UGX)</option><option value="percent">Percent (%)</option></select></div>
        <MoneyInput label="Discount value" value={discountText} onChange={setDiscountText} kind={discountType==="percent"?"percent":"money"}/></div>
      <p>Subtotal: <b>{ugx(sub)}</b></p><p>Discount: <b>{ugx(disc)}</b></p><h3>Total: {ugx(total)}</h3>
      <div className="field"><label>Customer (optional)</label><select value={customerId} onChange={e=>setCustomerId(e.target.value)}><option value="">Walk-in customer</option>{customers.map(c=><option key={c.id??c.customer_id} value={c.id??c.customer_id}>{c.full_name}</option>)}</select></div>
      <div className="field"><label>Payment method</label><select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value as PaymentMethod)}><option value="cash">Cash</option><option value="mtn_momo">MTN MoMo</option><option value="airtel_money">Airtel Money</option><option value="customer_credit">Customer Credit</option></select></div>
      {paymentMethod==="cash"?<><MoneyInput label="Cash received" value={receivedText} onChange={setReceivedText}/><p>Change: <strong>{ugx(change)}</strong></p></>:
      paymentMethod==="customer_credit"?<p>Available credit: {ugx(Number(selectedCustomer?.available_credit??0))}</p>:
      <div className="field"><label>Transaction reference</label><input value={reference} onChange={e=>setReference(e.target.value)} /></div>}
      <div className="field"><label htmlFor="pos-approval-pin">Manager approval PIN (only when required)</label>
        <input id="pos-approval-pin" type="password" autoComplete="off" value={approvalPin}
          onChange={e=>setApprovalPin(e.target.value)} placeholder="Only if the discount requires approval"/>
        <small>Never share this PIN in messages.</small></div>
      {!openShift&&<p role="alert" style={{padding:"10px 12px",border:"1px solid #b43f30",borderRadius:8,marginBottom:8}}>
        <strong>Cannot save a sale yet:</strong> You must <a href="/shifts">open your own cashier shift</a> first.
      </p>}
      {!canPost&&live&&<p role="alert"><strong>Posting disabled:</strong> live business operations are currently locked.</p>}
      <button className="btn primary" disabled={busy||!openShift||!cart.length||!live||!canPost} onClick={()=>submit(false)} style={{width:"100%",marginTop:9}}>{busy?"Saving…":"Complete and Save Sale"}</button>
      {message&&<div role={message.startsWith("SALE NOT SAVED")?"alert":"status"}
          style={{marginTop:10,padding:12,borderRadius:8,border:"1px solid #bda486",background:message.startsWith("SALE NOT SAVED")?"#fff1ef":"#f1fbf4"}}>
        <strong>{message}</strong>
        {message.startsWith("SALE NOT SAVED")&&<p style={{fontSize:12,margin:"6px 0 0"}}>This transaction has NOT reached the shared sales database. Fix the stated issue and try again.</p>}
      </div>}
      </section>
    </div>
    <section className="card" style={{marginTop:16}}><div className="pagehead"><div><h2>Shared POS Sales History</h2><p>Saved cloud transactions visible to authorized staff. Customer web orders remain separate until processed.</p></div>
      <button className="btn secondary" type="button" onClick={()=>void refreshSales()}>Refresh Sales</button></div>
      {historyStatus&&<p role="alert">{historyStatus}</p>}<p style={{fontSize:12}}>Last synced: {syncAt||"Awaiting connection"}. Updates automatically approximately every 15 seconds while open.</p>
      {sales.length===0?<p>No saved sales found in this environment.</p>:<div className="tablewrap"><table><thead><tr><th>Sale</th><th>Recorded</th><th>Status</th><th>Amount</th></tr></thead>
      <tbody>{sales.map(s=><tr key={s.id}><td>{s.sale_no||s.id.slice(0,8)}</td><td>{new Date(s.created_at).toLocaleString()}</td>
      <td>{s.held?"Held":s.status}</td><td>{ugx(Number(s.total))}</td></tr>)}</tbody></table></div>}
    </section>
  </main></div>;
}
