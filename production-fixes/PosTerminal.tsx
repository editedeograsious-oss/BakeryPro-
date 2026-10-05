'use client';

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { createClient } from "@/lib/supabase/client";
import { CartLine, subtotal, discountAmount, grandTotal, changeDue } from "@/lib/pos";
import { ugx } from "@/lib/costing";

type TenderMethod="cash"|"mtn_momo"|"airtel_money"|"bank";
type PaymentMethod=TenderMethod|"customer_credit"|"split";
type Tender={method:TenderMethod;amount:number;reference:string};

const tenderLabels:Record<TenderMethod,string>={cash:"Cash",mtn_momo:"MTN MoMo",airtel_money:"Airtel Money",bank:"Bank Transfer"};

export default function PosTerminal({products,openShift,customers,recentSales,live,showProfit}:{products:any[];openShift:any|null;customers:any[];recentSales:any[];live:boolean;showProfit:boolean;}){
  const router=useRouter();
  const [cart,setCart]=useState<CartLine[]>([]);
  const [discountType,setDiscountType]=useState<"amount"|"percent">("amount");
  const [discountValue,setDiscountValue]=useState(0);
  const [promoCode,setPromoCode]=useState("");
  const [promoDiscount,setPromoDiscount]=useState(0);
  const [promoName,setPromoName]=useState("");
  const [paymentMethod,setPaymentMethod]=useState<PaymentMethod>("cash");
  const [received,setReceived]=useState(0);
  const [reference,setReference]=useState("");
  const [tenders,setTenders]=useState<Tender[]>([{method:"cash",amount:0,reference:""},{method:"mtn_momo",amount:0,reference:""}]);
  const [customerId,setCustomerId]=useState("");
  const [approvalPin,setApprovalPin]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const requestId=useRef<string>(crypto.randomUUID());

  const sub=useMemo(()=>subtotal(cart),[cart]);
  const manualDisc=useMemo(()=>discountAmount(sub,discountType,discountValue),[sub,discountType,discountValue]);
  const disc=Math.min(sub,manualDisc+promoDiscount);
  const total=useMemo(()=>grandTotal(sub,disc),[sub,disc]);
  const change=paymentMethod==="cash"?changeDue(received,total):0;
  const tenderTotal=tenders.reduce((a,t)=>a+Number(t.amount||0),0);
  const selectedCustomer=customers.find((c:any)=>(c.id??c.customer_id)===customerId);
  const recentRevenue=recentSales.reduce((s:number,r:any)=>s+Number(r.net_total??r.total??0),0);
  const recentCogs=recentSales.reduce((s:number,r:any)=>s+Number(r.cogs??0),0);
  const recentProfit=recentSales.reduce((s:number,r:any)=>s+Number(r.gross_profit??0),0);

  function resetSale(){setCart([]);setDiscountValue(0);setPromoCode("");setPromoDiscount(0);setPromoName("");setReceived(0);setReference("");setCustomerId("");setApprovalPin("");setTenders([{method:"cash",amount:0,reference:""},{method:"mtn_momo",amount:0,reference:""}]);requestId.current=crypto.randomUUID();}
  function addProduct(p:any){setPromoDiscount(0);setPromoName("");setCart(prev=>{const found=prev.find(x=>x.productId===p.id);return found?prev.map(x=>x.productId===p.id?{...x,quantity:x.quantity+1}:x):[...prev,{productId:p.id,name:p.name,unitPrice:Number(p.selling_price),quantity:1}];});}
  function updateQty(id:string,delta:number){setPromoDiscount(0);setPromoName("");setCart(prev=>prev.map(x=>x.productId===id?{...x,quantity:Math.max(0,x.quantity+delta)}:x).filter(x=>x.quantity>0));}

  async function applyPromo(){
    if(!promoCode.trim()||!cart.length){setMessage("Enter a promo code after adding products.");return;}
    if(!live){setMessage("Demo mode: promotion quote simulated.");return;}
    setBusy(true);setMessage("");
    try{const supabase=createClient();const {data,error}=await supabase.rpc("quote_promotion",{p_code:promoCode.trim(),p_items:cart.map(x=>({product_id:x.productId,quantity:x.quantity}))});if(error)throw error;setPromoDiscount(Number(data?.discount??0));setPromoName(data?.name??promoCode.toUpperCase());setMessage(`Promotion applied: ${data?.name??promoCode.toUpperCase()} â¢ ${ugx(Number(data?.discount??0))} discount.`);}catch(e){setPromoDiscount(0);setPromoName("");setMessage(e instanceof Error?e.message:"Promotion could not be applied.");}finally{setBusy(false);}
  }

  function buildPayments(){
    if(paymentMethod==="split") return tenders.filter(t=>Number(t.amount)>0).map(t=>({method:t.method,amount:Number(t.amount),reference:t.method==="cash"?null:t.reference.trim()}));
    if(paymentMethod==="customer_credit") return [];
    return [{method:paymentMethod,amount:total,reference:paymentMethod==="cash"?null:reference.trim()}];
  }

  async function submit(hold:boolean){
    if(!cart.length){setMessage("Add at least one product.");return;}
    if(!openShift){setMessage("Start a cashier shift before creating sales.");return;}
    if(!hold&&paymentMethod==="cash"&&received<total){setMessage("Cash received is less than the total.");return;}
    if(!hold&&["mtn_momo","airtel_money","bank"].includes(paymentMethod)&&!reference.trim()){setMessage("Enter the payment transaction reference.");return;}
    if(!hold&&paymentMethod==="split"){
      if(Math.abs(tenderTotal-total)>0.01){setMessage(`Split payments must equal ${ugx(total)}. Current split total is ${ugx(tenderTotal)}.`);return;}
      if(tenders.some(t=>t.amount>0&&t.method!=="cash"&&!t.reference.trim())){setMessage("Enter a reference for every Mobile Money or bank split payment.");return;}
    }
    if(!hold&&paymentMethod==="customer_credit"&&promoDiscount>0){setMessage("Promo codes are currently for paid sales. Remove the promo code or use a paid tender so promotion usage stays fully auditable.");return;}
    if(!hold&&paymentMethod==="customer_credit"&&!customerId){setMessage("Select a registered customer for a credit sale.");return;}
    if(!hold&&paymentMethod==="customer_credit"&&!selectedCustomer?.credit_enabled){setMessage("Credit is not enabled for this customer. A CEO / General Manager must set a credit limit first.");return;}
    if(!hold&&paymentMethod==="customer_credit"&&Number(selectedCustomer?.available_credit??0)<total){setMessage("This sale would exceed the customerâs available credit.");return;}
    if(!live){setMessage(hold?"Demo sale held.":"Demo sale completed. No cloud transaction was created.");if(!hold)resetSale();return;}

    setBusy(true);setMessage("");
    try{
      const supabase=createClient();let data:any,error:any;
      const items=cart.map(x=>({product_id:x.productId,quantity:x.quantity}));
      if(!hold&&paymentMethod==="customer_credit"){
        const result=await supabase.rpc("complete_credit_sale_controlled",{p_items:items,p_discount:disc,p_notes:null,p_client_request_id:requestId.current,p_customer_id:customerId,p_approval_pin:approvalPin.trim()||null});data=result.data;error=result.error;
      }else{
        const result=await supabase.rpc("complete_sale_v038",{p_items:items,p_manual_discount:manualDisc,p_promo_code:promoCode.trim()||null,p_payments:hold?[]:buildPayments(),p_notes:null,p_hold:hold,p_client_request_id:requestId.current,p_customer_id:customerId||null,p_approval_pin:approvalPin.trim()||null});data=result.data;error=result.error;
      }
      if(error)throw error;
      setMessage(`${hold?"Sale held":"Sale completed"} â¢ Reference ${data}`);if(!hold)resetSale();router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not complete sale.");}finally{setBusy(false);}
  }

  return <div className="shell"><Sidebar/><main className="main">
    <div className="pagehead"><div><h1>Cashier POS</h1><p>Controlled discounts, promo codes, split tender, bank payments, customer credit and auditable refunds.</p></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><span className={openShift?"badge green":"badge red"}>{openShift?"Shift Open":"No Open Shift"}</span><a className="btn secondary" href="/sales-control">Returns / Refunds</a><button className="btn secondary" disabled={busy} onClick={()=>submit(true)}>Hold Sale</button><button className="btn secondary" onClick={resetSale}>Clear Cart</button></div></div>
    {message&&<div className="hero" style={{padding:14,marginBottom:14}}><b>{message}</b></div>}
    {!openShift&&<div className="hero"><h2>Cashier shift required</h2><p>Open a cashier shift before selling. <a href="/shifts"><b>Go to Cashier Shifts</b></a>.</p></div>}
    <div className="grid2"><section><div className="card"><h3 style={{color:"var(--brown)",marginTop:0}}>Products</h3><div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:10}}>{products.map((p:any)=><button key={p.id} onClick={()=>addProduct(p)} className="btn secondary" style={{minHeight:95,textAlign:"left"}}><div style={{fontWeight:900}}>{p.name}</div><div style={{fontSize:11,color:"var(--muted)",marginTop:4}}>{p.category_name}</div><div style={{fontSize:12,color:"var(--muted)",marginTop:4}}>{ugx(Number(p.selling_price))}</div><div style={{fontSize:11,marginTop:5,fontWeight:800}}>Stock: {Number(p.available_stock??0).toLocaleString()}</div></button>)}</div></div></section>
    <section><div className="card"><h3 style={{color:"var(--brown)",marginTop:0}}>Current Sale</h3>
      {cart.length===0?<p style={{color:"var(--muted)"}}>Tap a product to start the sale.</p>:<div className="tablewrap"><table style={{minWidth:0}}><thead><tr><th>Item</th><th>Qty</th><th>Total</th></tr></thead><tbody>{cart.map(line=><tr key={line.productId}><td><b>{line.name}</b><br/><small>{ugx(line.unitPrice)} each</small></td><td><div style={{display:"flex",gap:6,alignItems:"center"}}><button className="btn secondary" style={{padding:"5px 9px"}} onClick={()=>updateQty(line.productId,-1)}>-</button><b>{line.quantity}</b><button className="btn secondary" style={{padding:"5px 9px"}} onClick={()=>updateQty(line.productId,1)}>+</button></div></td><td><b>{ugx(line.unitPrice*line.quantity)}</b></td></tr>)}</tbody></table></div>}
      <div style={{marginTop:16,borderTop:"1px solid var(--line)",paddingTop:14}}><div className="grid2"><div className="field"><label>Manual discount type</label><select value={discountType} onChange={e=>setDiscountType(e.target.value as any)}><option value="amount">Amount (UGX)</option><option value="percent">Percent (%)</option></select></div><div className="field"><label>Manual discount value</label><input type="number" min="0" value={discountValue} onChange={e=>setDiscountValue(Number(e.target.value))}/></div></div>
      <div className="grid2"><div className="field"><label>Promo code</label><input value={promoCode} onChange={e=>{setPromoCode(e.target.value.toUpperCase());setPromoDiscount(0);setPromoName("");}} placeholder="Optional promo code"/></div><div className="field" style={{justifyContent:"end"}}><label>Promotion</label><button className="btn secondary" disabled={busy||!promoCode.trim()} onClick={applyPromo}>Apply Code</button></div></div>{promoName&&<p className="badge green">{promoName}: -{ugx(promoDiscount)}</p>}
      <p style={{display:"flex",justifyContent:"space-between"}}><span>Subtotal</span><b>{ugx(sub)}</b></p><p style={{display:"flex",justifyContent:"space-between"}}><span>Total discounts</span><b>- {ugx(disc)}</b></p><p style={{display:"flex",justifyContent:"space-between",fontSize:22,borderTop:"2px solid var(--brown)",paddingTop:9}}><span><b>Total</b></span><b>{ugx(total)}</b></p></div>
      <div className="field"><label>Customer (optional for loyalty)</label><select value={customerId} onChange={e=>setCustomerId(e.target.value)}><option value="">Walk-in customer</option>{customers.map((c:any)=><option key={c.id??c.customer_id} value={c.id??c.customer_id}>{c.full_name} {c.phone?`â¢ ${c.phone}`:""}</option>)}</select></div>
      <div className="field"><label>Payment method</label><select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value as PaymentMethod)}><option value="cash">Cash</option><option value="mtn_momo">MTN MoMo</option><option value="airtel_money">Airtel Money</option><option value="bank">Bank Transfer</option><option value="split">Split Payment</option><option value="customer_credit">Customer Credit</option></select></div>
      {paymentMethod==="cash"?<><div className="field"><label>Cash received</label><input type="number" min="0" value={received} onChange={e=>setReceived(Number(e.target.value))}/></div><p><b>Change: {ugx(change)}</b></p></>:paymentMethod==="customer_credit"?<div className="hero" style={{padding:12}}><b>Credit Sale</b><p style={{marginTop:4}}>Customer: {selectedCustomer?.full_name??"Select a customer"} â¢ Available credit: {ugx(Number(selectedCustomer?.available_credit??0))}</p></div>:paymentMethod==="split"?<div className="card" style={{padding:12,boxShadow:"none"}}><b>Split tender</b>{tenders.map((t,i)=><div className="grid3" key={i}><div className="field"><label>Method</label><select value={t.method} onChange={e=>setTenders(v=>v.map((x,j)=>j===i?{...x,method:e.target.value as TenderMethod}:x))}>{Object.entries(tenderLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div><div className="field"><label>Amount</label><input type="number" min="0" value={t.amount} onChange={e=>setTenders(v=>v.map((x,j)=>j===i?{...x,amount:Number(e.target.value)}:x))}/></div><div className="field"><label>Reference</label><input disabled={t.method==="cash"} value={t.reference} onChange={e=>setTenders(v=>v.map((x,j)=>j===i?{...x,reference:e.target.value}:x))}/></div></div>)}<div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><button className="btn secondary" onClick={()=>setTenders(v=>[...v,{method:"cash",amount:0,reference:""}])}>+ Payment Line</button><b>{ugx(tenderTotal)} / {ugx(total)}</b></div></div>:<div className="field"><label>Transaction reference</label><input value={reference} onChange={e=>setReference(e.target.value)} placeholder="Required reference"/></div>}
      {disc>0&&<div className="field"><label>Manager approval PIN (only required if your discount exceeds your role limit)</label><input type="password" value={approvalPin} onChange={e=>setApprovalPin(e.target.value)} autoComplete="off"/></div>}
      <button className="btn primary" disabled={busy||!openShift} style={{width:"100%",marginTop:8}} onClick={()=>submit(false)}>{busy?"Postingâ¦":"Complete Sale"}</button>
    </div></section></div>

    <div className="card" style={{marginTop:16}}>
      <div className="pagehead" style={{marginBottom:10}}>
        <div><h2 style={{margin:0,color:"var(--brown)"}}>Recent Sales</h2><p style={{marginTop:5}}>Completed POS transactions stay visible here after the cart is cleared.</p></div>
        <a className="btn secondary" href="/reports">Financial Reports</a>
      </div>
      <div className="grid4">
        <div className="card stat"><div className="label">Recent Transactions</div><div className="value">{recentSales.length}</div></div>
        <div className="card stat"><div className="label">Recent Revenue</div><div className="value">{ugx(recentRevenue)}</div></div>
        {showProfit&&<div className="card stat"><div className="label">Recent COGS</div><div className="value">{ugx(recentCogs)}</div></div>}
        {showProfit&&<div className="card stat"><div className="label">Recent Gross Profit</div><div className="value">{ugx(recentProfit)}</div></div>}
      </div>
      <div className="tablewrap" style={{marginTop:14}}>
        <table>
          <thead><tr><th>Date</th><th>Sale</th><th>Items</th><th>Qty</th><th>Payment</th><th>Total</th>{showProfit&&<><th>COGS</th><th>Gross Profit</th></>}<th>Status</th></tr></thead>
          <tbody>{recentSales.length===0?<tr><td colSpan={showProfit?9:7}>No completed sales yet.</td></tr>:recentSales.map((r:any)=><tr key={r.id}>
            <td>{new Date(r.created_at).toLocaleString()}</td>
            <td><b>{r.sale_no}</b>{String(r.notes??"").includes("FOR TESTING ONLY")&&<><br/><span className="badge gold">TEST</span></>}</td>
            <td>{r.items_summary||"—"}</td>
            <td>{Number(r.units_sold??0).toLocaleString()}</td>
            <td>{r.payment_summary||"—"}</td>
            <td><b>{ugx(Number(r.net_total??r.total??0))}</b></td>
            {showProfit&&<><td>{ugx(Number(r.cogs??0))}</td><td><b>{ugx(Number(r.gross_profit??0))}</b></td></>}
            <td><span className={r.status==="completed"?"badge green":"badge gold"}>{String(r.status??"").toUpperCase()}</span></td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>
  </main></div>;
}
