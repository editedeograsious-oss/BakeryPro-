'use client';

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ugx } from "@/lib/costing";
import RecycleActionButton from "@/components/admin/RecycleActionButton";

type DraftItem={product_id:string;quantity:number;customization_notes:string};

export default function CustomerOrderManager({
  orders,customers,products,shifts,live,role
}:{
  orders:any[];customers:any[];products:any[];shifts:any[];live:boolean;role:string;
}){
  const router=useRouter();
  const [selectedId,setSelectedId]=useState(orders[0]?.id??"");
  const [customerId,setCustomerId]=useState(customers[0]?.id??customers[0]?.customer_id??"");
  const [requiredAt,setRequiredAt]=useState("");
  const [fulfillment,setFulfillment]=useState("pickup");
  const [deliveryAddress,setDeliveryAddress]=useState("");
  const [discount,setDiscount]=useState(0);
  const [notes,setNotes]=useState("");
  const [items,setItems]=useState<DraftItem[]>(products[0]?[{product_id:products[0].id,quantity:1,customization_notes:""}]:[]);
  const [amount,setAmount]=useState(0);
  const [method,setMethod]=useState("cash");
  const [reference,setReference]=useState("");
  const [shiftId,setShiftId]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const [refundAmount,setRefundAmount]=useState(0);
  const [refundReason,setRefundReason]=useState("");
  const [refundShiftId,setRefundShiftId]=useState("");
  const createRequest=useRef(crypto.randomUUID());
  const paymentRequest=useRef(crypto.randomUUID());
  const refundRequest=useRef(crypto.randomUUID());

  const current=orders.find(o=>o.id===selectedId)??orders[0];
  const canSales=role!=="baker";
  const outstanding=useMemo(()=>orders.filter(o=>o.status!=="cancelled").reduce((s,o)=>s+Number(o.balance_due||0),0),[orders]);
  const totalOrderValue=useMemo(()=>orders.filter(o=>o.status!=="cancelled").reduce((s,o)=>s+Number(o.total_amount||0),0),[orders]);
  const totalPaid=useMemo(()=>orders.filter(o=>o.status!=="cancelled").reduce((s,o)=>s+Number(o.amount_paid||0),0),[orders]);
  const draftSubtotal=items.reduce((s,i)=>{
    const p=products.find(x=>x.id===i.product_id);
    return s+Number(p?.selling_price||0)*Number(i.quantity||0);
  },0);

  function addLine(){
    if(products[0])setItems(prev=>[...prev,{product_id:products[0].id,quantity:1,customization_notes:""}]);
  }

  async function createOrder(){
    if(!customerId||!requiredAt||items.length===0){setMessage("Customer, required date/time and at least one item are required.");return;}
    if(fulfillment==="delivery"&&!deliveryAddress.trim()){setMessage("Delivery address is required.");return;}
    if(items.some(i=>!i.product_id||i.quantity<=0)){setMessage("Every order line needs a product and positive quantity.");return;}
    if(discount<0||discount>draftSubtotal){setMessage("Discount must be between zero and the current subtotal.");return;}
    if(!live){setMessage("Demo mode: customer order creation simulated.");return;}
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {data,error}=await supabase.rpc("create_customer_order",{
        p_customer_id:customerId,
        p_required_at:new Date(requiredAt).toISOString(),
        p_fulfillment:fulfillment,
        p_delivery_address:fulfillment==="delivery"?deliveryAddress.trim():null,
        p_discount:discount,
        p_notes:notes.trim()||null,
        p_items:items,
        p_client_request_id:createRequest.current,
      });
      if(error)throw error;
      setMessage(`Customer order created • ${data}`);
      createRequest.current=crypto.randomUUID();
      setDiscount(0);setNotes("");setDeliveryAddress("");
      router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not create order.");}
    finally{setBusy(false);}
  }

  async function pay(){
    if(!current){setMessage("Select an order.");return;}
    if(amount<=0||amount>Number(current.balance_due)){setMessage("Payment must be positive and cannot exceed balance.");return;}
    if(method!=="cash"&&!reference.trim()){setMessage("Reference is required for non-cash payment.");return;}
    if(!live){setMessage("Demo mode: order payment simulated.");return;}
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {data,error}=await supabase.rpc("record_customer_order_payment",{
        p_order_id:current.id,
        p_amount:amount,
        p_method:method,
        p_reference:reference.trim()||null,
        p_shift_id:shiftId||null,
        p_client_request_id:paymentRequest.current,
      });
      if(error)throw error;
      setMessage(`Payment recorded • ${data}`);
      paymentRequest.current=crypto.randomUUID();
      setAmount(0);setReference("");
      router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not record payment.");}
    finally{setBusy(false);}
  }


  async function refundOrder(){
    if(!current){setMessage("Select an order.");return;}
    if(!["owner","manager"].includes(role)){setMessage("Only Owner/Manager can refund customer-order payments.");return;}
    if(refundAmount<=0||refundAmount>Number(current.amount_paid)){setMessage("Refund must be positive and cannot exceed net amount paid.");return;}
    if(!refundReason.trim()){setMessage("Refund reason is required.");return;}
    if(!live){setMessage("Demo mode: customer-order refund simulated.");return;}
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {data,error}=await supabase.rpc("refund_customer_order",{
        p_order_id:current.id,p_amount:refundAmount,p_reason:refundReason.trim(),
        p_shift_id:refundShiftId||null,p_client_request_id:refundRequest.current,
      });
      if(error)throw error;
      refundRequest.current=crypto.randomUUID();
      setRefundAmount(0);setRefundReason("");setRefundShiftId("");
      setMessage(`Refund recorded • ${data}`);
      router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not refund customer order.");}
    finally{setBusy(false);}
  }

  async function move(status:string){
    if(!current)return;
    let reason:string|null=null;
    if(status==="cancelled"){
      reason=window.prompt("Cancellation reason")?.trim()||null;
      if(!reason){setMessage("Cancellation reason is required.");return;}
    }
    if(!live){setMessage(`Demo mode: order status changed to ${status}.`);return;}
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {error}=await supabase.rpc("update_customer_order_status",{p_order_id:current.id,p_status:status,p_reason:reason});
      if(error)throw error;
      setMessage(`Order moved to ${status}.`);
      router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not update order status.");}
    finally{setBusy(false);}
  }

  const nextFor=(status:string,fulfill:string)=>{
    if(role==="baker"){
      if(status==="confirmed")return "in_production";
      if(status==="in_production")return "ready";
      return null;
    }
    if(status==="pending")return "confirmed";
    if(status==="confirmed")return role==="cashier"?null:"in_production";
    if(status==="in_production")return role==="cashier"?null:"ready";
    if(status==="ready")return fulfill==="pickup"?"completed":null;
    return null;
  };

  return <>
    <div className="pagehead"><div><h1>Customer Orders</h1><p>Live orders, deposits, balances, status transitions and printable receipts.</p></div><div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}><a className="btn secondary" href="/credit-book">Credit Book</a><span className="badge green">Ledger Balances</span></div></div>
    {message&&<div className="hero" style={{padding:14}}><b>{message}</b></div>}

    <div className="grid4">
      <div className="card stat"><div className="label">Open Orders</div><div className="value">{orders.filter(o=>!["completed","cancelled"].includes(o.status)).length}</div></div>
      <div className="card stat"><div className="label">Order Value</div><div className="value">{ugx(totalOrderValue)}</div></div>
      <div className="card stat"><div className="label">Amount Paid</div><div className="value">{ugx(totalPaid)}</div></div>
      <div className="card stat"><div className="label">Outstanding</div><div className="value">{ugx(outstanding)}</div></div>
    </div>
    <div className="grid4" style={{marginTop:14}}>
      <div className="card stat"><div className="label">Pending</div><div className="value">{orders.filter(o=>o.status==="pending").length}</div></div>
      <div className="card stat"><div className="label">In Production</div><div className="value">{orders.filter(o=>o.status==="in_production").length}</div></div>
      <div className="card stat"><div className="label">Ready</div><div className="value">{orders.filter(o=>o.status==="ready").length}</div></div>
      <div className="card stat"><div className="label">Completed</div><div className="value">{orders.filter(o=>o.status==="completed").length}</div></div>
    </div>

    {canSales&&<div className="card" style={{marginTop:16}}>
      <h3 style={{color:"var(--brown)",marginTop:0}}>New Standard Product Order</h3>
      <div className="grid2">
        <div className="field"><label>Customer</label><select value={customerId} onChange={e=>setCustomerId(e.target.value)}>{customers.map(c=><option key={c.id??c.customer_id} value={c.id??c.customer_id}>{c.full_name}</option>)}</select></div>
        <div className="field"><label>Required date/time</label><input type="datetime-local" value={requiredAt} onChange={e=>setRequiredAt(e.target.value)}/></div>
      </div>
      <div className="grid2">
        <div className="field"><label>Fulfillment</label><select value={fulfillment} onChange={e=>setFulfillment(e.target.value)}><option value="pickup">Pickup</option><option value="delivery">Delivery</option></select></div>
        {fulfillment==="delivery"?<div className="field"><label>Delivery address</label><input value={deliveryAddress} onChange={e=>setDeliveryAddress(e.target.value)}/></div>:<div className="field"><label>Discount (UGX)</label><input type="number" min="0" value={discount} onChange={e=>setDiscount(Number(e.target.value))}/></div>}
      </div>
      {fulfillment==="delivery"&&<div className="field"><label>Discount (UGX)</label><input type="number" min="0" value={discount} onChange={e=>setDiscount(Number(e.target.value))}/></div>}
      {items.map((line,i)=><div className="grid2" key={i} style={{borderTop:"1px solid var(--line)",paddingTop:8}}>
        <div className="field"><label>Product</label><select value={line.product_id} onChange={e=>setItems(prev=>prev.map((x,j)=>j===i?{...x,product_id:e.target.value}:x))}>{products.map(p=><option key={p.id} value={p.id}>{p.name} • {ugx(Number(p.selling_price))}</option>)}</select></div>
        <div><div className="field"><label>Quantity</label><input type="number" min="0.001" step="any" value={line.quantity} onChange={e=>setItems(prev=>prev.map((x,j)=>j===i?{...x,quantity:Number(e.target.value)}:x))}/></div><div className="field"><label>Customization notes</label><input value={line.customization_notes} onChange={e=>setItems(prev=>prev.map((x,j)=>j===i?{...x,customization_notes:e.target.value}:x))}/></div></div>
      </div>)}
      <button className="btn secondary" onClick={addLine}>+ Product Line</button>
      <div className="field"><label>Order notes</label><input value={notes} onChange={e=>setNotes(e.target.value)}/></div>
      <p><b>Draft subtotal: {ugx(draftSubtotal)} • Draft total before delivery charge: {ugx(Math.max(0,draftSubtotal-discount))}</b></p>
      <button className="btn primary" disabled={busy} onClick={createOrder}>{busy?"Working…":"Create Order"}</button>
    </div>}

    <div className="tablewrap" style={{marginTop:16}}>
      <table><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Paid</th><th>Balance</th><th>Required</th><th>Fulfillment</th><th>Status</th><th>Open</th></tr></thead>
      <tbody>{orders.length===0?<tr><td colSpan={10}>No customer orders found.</td></tr>:orders.map(o=><tr key={o.id}>
        <td><b>{o.order_no}</b></td><td>{o.customer_name}</td><td>{o.item_summary??`${o.item_count??0} item(s)`}</td><td>{ugx(Number(o.total_amount))}</td><td>{ugx(Number(o.amount_paid))}</td><td><b>{ugx(Number(o.balance_due))}</b></td><td>{new Date(o.required_at).toLocaleString()}</td><td>{o.fulfillment}</td><td><span className={o.status==="completed"||o.status==="ready"?"badge green":o.status==="cancelled"?"badge red":"badge gold"}>{o.status}</span></td><td><div className="action-row"><button className="btn secondary" onClick={()=>setSelectedId(o.id)}>Open</button>{["owner","manager"].includes(role)&&["pending","confirmed"].includes(o.status)&&<RecycleActionButton entityType="customer_order" entityId={o.id} label={o.order_no} live={live}/>}</div></td>
      </tr>)}</tbody></table>
    </div>

    {current&&<div className="grid2" style={{marginTop:16}}>
      <div className="card">
        <h3 style={{color:"var(--brown)",marginTop:0}}>{current.order_no} — Payment</h3>
        <p><b>{current.customer_name}</b><br/><span style={{color:"var(--muted)"}}>{current.item_summary}</span></p>
        <p>Total <b style={{float:"right"}}>{ugx(Number(current.total_amount))}</b></p>
        <p>Paid <b style={{float:"right"}}>{ugx(Number(current.amount_paid))}</b></p>
        {Number(current.refunded_amount||0)>0&&<p>Refunded <b style={{float:"right"}}>{ugx(Number(current.refunded_amount||0))}</b></p>}
        <p style={{fontSize:19}}>Balance <b style={{float:"right"}}>{ugx(Number(current.balance_due))}</b></p>
        {canSales&&<>
          <div className="field"><label>Payment amount</label><input type="number" min="0" value={amount} onChange={e=>setAmount(Number(e.target.value))}/></div>
          <div className="field"><label>Method</label><select value={method} onChange={e=>setMethod(e.target.value)}><option value="cash">Cash</option><option value="mtn_momo">MTN MoMo</option><option value="airtel_money">Airtel Money</option><option value="bank">Bank</option></select></div>
          {method!=="cash"?<div className="field"><label>Transaction reference</label><input value={reference} onChange={e=>setReference(e.target.value)}/></div>:<div className="field"><label>Cashier shift</label><select value={shiftId} onChange={e=>setShiftId(e.target.value)}><option value="">Auto / general cash</option>{shifts.map(s=><option key={s.id} value={s.id}>{s.cashier_name}</option>)}</select></div>}
          <button className="btn primary" disabled={busy||Number(current.balance_due)<=0} style={{width:"100%"}} onClick={pay}>Record Payment</button>
        </>}
        {["owner","manager"].includes(role)&&Number(current.amount_paid)>0&&<>
          <hr style={{border:0,borderTop:"1px solid var(--line)",margin:"16px 0"}}/>
          <h4>Refund Customer Payment</h4>
          <div className="field"><label>Refund amount</label><input type="number" min="0" value={refundAmount} onChange={e=>setRefundAmount(Number(e.target.value))}/></div>
          <div className="field"><label>Reason</label><input value={refundReason} onChange={e=>setRefundReason(e.target.value)} placeholder="Cancellation / overpayment / service issue"/></div>
          <button className="btn secondary" disabled={busy} onClick={refundOrder}>Record Refund</button>
          <p style={{color:"var(--muted)",fontSize:12}}>Refund allocation preserves the original payment method. Cancellation is allowed only after net payments reach zero.</p>
        </>}
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:12}}>
          {nextFor(current.status,current.fulfillment)&&<button className="btn secondary" disabled={busy} onClick={()=>move(nextFor(current.status,current.fulfillment)!)}>Next: {nextFor(current.status,current.fulfillment)}</button>}
          {canSales&&!["completed","cancelled"].includes(current.status)&&<button className="btn secondary" disabled={busy} onClick={()=>move("cancelled")}>Cancel Order</button>}
        </div>
      </div>

      <div className="card">
        <h3 style={{color:"var(--brown)",marginTop:0}}>Printable Receipt</h3>
        <div style={{fontFamily:"monospace",border:"1px dashed #a79588",padding:14,borderRadius:12}}>
          <div style={{textAlign:"center"}}><b>DS BAKERY</b><br/>CUSTOMER ORDER RECEIPT</div><hr/>
          <p>Order: <b>{current.order_no}</b></p><p>Customer: <b>{current.customer_name}</b></p><p>Items: {current.item_summary}</p><p>Required: {new Date(current.required_at).toLocaleString()}</p><p>Fulfillment: {current.fulfillment}</p><hr/>
          <p>Total: <b>{ugx(Number(current.total_amount))}</b></p><p>Paid: <b>{ugx(Number(current.amount_paid))}</b></p><p>Balance: <b>{ugx(Number(current.balance_due))}</b></p>
        </div>
        <button className="btn secondary" style={{marginTop:12,width:"100%"}} onClick={()=>window.print()}>Print / Save Receipt</button>
      </div>
    </div>}
  </>;
}
