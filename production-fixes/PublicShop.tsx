"use client";

import { useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildPublicWhatsAppUrl } from "@/lib/publicSite";
import { ugx } from "@/lib/costing";

type CartLine={product:any;quantity:number};

export default function PublicShop({catalog,categories,businessName,whatsappPhone,deliveryEnabled,orderingOpen}:{catalog:any[];categories:string[];businessName:string;whatsappPhone?:string|null;deliveryEnabled:boolean;orderingOpen:boolean}){
  const [cart,setCart]=useState<Record<string,number>>({});
  const [name,setName]=useState("");const [phone,setPhone]=useState("");const [email,setEmail]=useState("");
  const [fulfillment,setFulfillment]=useState<"pickup"|"delivery">("pickup");
  const [address,setAddress]=useState("");const [requiredAt,setRequiredAt]=useState("");const [notes,setNotes]=useState("");
  const [message,setMessage]=useState("");const [busy,setBusy]=useState(false);const requestId=useRef("");

  const lines:CartLine[]=useMemo(()=>catalog.filter(p=>Number(cart[p.id]||0)>0).map(p=>({product:p,quantity:Number(cart[p.id])})),[catalog,cart]);
  const total=useMemo(()=>lines.reduce((s,l)=>s+Number(l.product.selling_price||0)*l.quantity,0),[lines]);
  const itemCount=useMemo(()=>lines.reduce((s,l)=>s+l.quantity,0),[lines]);

  function add(id:string){if(!orderingOpen)return;setCart(c=>({...c,[id]:Number(c[id]||0)+1}));setMessage("");}
  function change(id:string,q:number){setCart(c=>{const n={...c};if(q<=0)delete n[id];else n[id]=Math.min(q,100);return n;});}

  async function checkout(){
    if(!orderingOpen){setMessage("Online checkout is not open yet. Please contact DS Bakery for enquiries.");return;}
    if(lines.length===0){setMessage("Add at least one product to your cart.");return;}
    if(!name.trim()||!phone.trim()){setMessage("Your name and phone number are required.");return;}
    if(!requiredAt){setMessage("Choose when you need the order.");return;}
    if(fulfillment==="delivery"&&!address.trim()){setMessage("Enter the delivery address.");return;}
    const when=new Date(requiredAt);
    if(Number.isNaN(when.getTime())||when.getTime()<=Date.now()){setMessage("Required date and time must be in the future.");return;}
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();if(!requestId.current)requestId.current=crypto.randomUUID();
      const {data,error}=await supabase.rpc("submit_public_order",{
        p_full_name:name.trim(),p_phone:phone.trim(),p_email:email.trim()||null,p_fulfillment:fulfillment,
        p_required_at:when.toISOString(),p_delivery_address:fulfillment==="delivery"?address.trim():null,p_notes:notes.trim()||null,
        p_items:lines.map(l=>({product_id:l.product.id,quantity:l.quantity})),p_client_request_id:requestId.current,
      });
      if(error)throw error;
      setMessage("Order "+(data?.order_no??"received")+" has been submitted. Total: "+ugx(Number(data?.total??total))+". DS Bakery staff will confirm it with you.");
      setCart({});setNotes("");requestId.current="";
    }catch(e){setMessage(e instanceof Error?e.message:"Could not submit your order. Please contact DS Bakery.");}
    finally{setBusy(false);}
  }

  if(catalog.length===0)return <div className="hero" style={{marginTop:22}}><h2>Menu is being prepared</h2><p>No active public products are available yet.</p></div>;

  return <>
    {!orderingOpen&&<div className="hero" style={{marginTop:22}}><span className="badge gold">Pre-launch</span><h2 style={{marginBottom:6}}>Online checkout is not open yet</h2><p style={{marginBottom:0}}>You can browse current products and prices. Please contact DS Bakery for enquiries while final launch checks are completed.</p></div>}
    {categories.map(category=>{
      const products=catalog.filter((p:any)=>String(p.category_name||"Bakery Menu")===category);
      return <div key={category} style={{marginTop:34}}>
        <h3 style={{fontFamily:"Georgia,serif",fontSize:25,color:"var(--brown)",marginBottom:14}}>{category}</h3>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))",gap:16}}>
          {products.map((p:any)=>{
            const q=Number(cart[p.id]||0);const wa=buildPublicWhatsAppUrl(whatsappPhone,"Hello "+businessName+", I would like to ask about "+p.name+".");
            return <article className="card" key={p.id} style={{overflow:"hidden",padding:0,borderRadius:20}}>
              {p.image_url?<img src={p.image_url} alt={p.name} style={{width:"100%",height:190,objectFit:"cover",display:"block"}}/>:<div style={{height:190,display:"grid",placeItems:"center",background:"linear-gradient(145deg,#fff4d8,#f0d4a0)",fontFamily:"Georgia,serif",fontSize:52,color:"var(--brown)"}}>{String(p.name).slice(0,1).toUpperCase()}</div>}
              <div style={{padding:18}}>
                <h4 style={{fontFamily:"Georgia,serif",fontSize:21,color:"var(--brown)",margin:"0 0 7px"}}>{p.name}</h4>
                <p style={{color:"var(--muted)",lineHeight:1.55,minHeight:48,margin:"0 0 14px"}}>{p.description||"Fresh bakery product from DS Bakery."}</p>
                <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                  <b style={{fontSize:18,color:"var(--brown)"}}>{ugx(Number(p.selling_price))}</b>
                  <button className={orderingOpen?"btn primary":"btn secondary"} type="button" disabled={!orderingOpen} onClick={()=>add(p.id)}>{orderingOpen?("Add to Cart"+(q>0?" ("+q+")":"")):"Ordering opens soon"}</button>
                </div>
                {wa&&<a href={wa} target="_blank" rel="noreferrer" style={{display:"inline-block",marginTop:10,fontSize:12}}>Ask on WhatsApp →</a>}
              </div>
            </article>;
          })}
        </div>
      </div>;
    })}
    {orderingOpen&&<div id="checkout" className="card" style={{marginTop:38,padding:24,borderRadius:22}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"start",gap:16,flexWrap:"wrap"}}><div><span className="badge green">Online Order</span><h3 style={{fontFamily:"Georgia,serif",fontSize:28,color:"var(--brown)",margin:"10px 0 5px"}}>Your Cart</h3><p style={{color:"var(--muted)",margin:0}}>Place the order now. Payment is confirmed manually until payment integration is activated.</p></div><div style={{textAlign:"right"}}><b>{itemCount} item(s)</b><div style={{fontSize:22,fontWeight:900,color:"var(--brown)"}}>{ugx(total)}</div></div></div>
      {lines.length===0?<p style={{marginTop:18,color:"var(--muted)"}}>Your cart is empty. Add products above.</p>:<div className="tablewrap" style={{marginTop:16}}><table><thead><tr><th>Product</th><th>Price</th><th>Quantity</th><th>Total</th><th></th></tr></thead><tbody>{lines.map(l=><tr key={l.product.id}><td><b>{l.product.name}</b></td><td>{ugx(Number(l.product.selling_price))}</td><td><input style={{width:90}} type="number" min="1" max="100" value={l.quantity} onChange={e=>change(l.product.id,Number(e.target.value))}/></td><td>{ugx(Number(l.product.selling_price)*l.quantity)}</td><td><button className="btn danger" type="button" onClick={()=>change(l.product.id,0)}>Remove</button></td></tr>)}</tbody></table></div>}
      <div className="grid2" style={{marginTop:18}}><div className="field"><label>Your full name</label><input value={name} onChange={e=>setName(e.target.value)}/></div><div className="field"><label>Phone number</label><input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="07..."/></div></div>
      <div className="grid2"><div className="field"><label>Email (optional)</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)}/></div><div className="field"><label>Pickup or delivery</label><select value={fulfillment} onChange={e=>setFulfillment(e.target.value as "pickup"|"delivery")}><option value="pickup">Pickup</option>{deliveryEnabled&&<option value="delivery">Delivery</option>}</select></div></div>
      <div className="grid2"><div className="field"><label>Required date & time</label><input type="datetime-local" value={requiredAt} onChange={e=>setRequiredAt(e.target.value)}/></div>{fulfillment==="delivery"?<div className="field"><label>Delivery address</label><input value={address} onChange={e=>setAddress(e.target.value)}/></div>:<div className="field"><label>Collection</label><input value="Pickup from DS Bakery" disabled/></div>}</div>
      <div className="field"><label>Order notes (optional)</label><textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Special instructions, preferred flavour/details, etc."/></div>
      {message&&<div className="hero" style={{padding:14,marginBottom:12}}><b>{message}</b></div>}
      <button className="btn primary" type="button" disabled={busy||lines.length===0} onClick={checkout}>{busy?"Submitting…":"Place Order"}</button>
    </div>}
  </>;
}
