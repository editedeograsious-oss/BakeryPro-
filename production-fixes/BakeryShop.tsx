"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
type Product={id:string;name:string;description:string|null;selling_price:number|string;image_url:string|null;category_name:string|null};
type Review={rating:number;display_name:string;review_text:string;created_at:string};
type Site={business_name?:string;tagline?:string;phone?:string;opening_hours?:string;address_text?:string;delivery_enabled?:boolean};
const money=(n:number)=>"UGX "+Math.round(n).toLocaleString("en-US");
const err=(e:unknown)=>e instanceof Error?e.message:"The request could not be completed.";
export default function BakeryShop({products,site,orderingAllowed}:{products:Product[];site:Site;orderingAllowed:boolean}){
 const [quantities,setQuantities]=useState<Record<string,number>>({});
 const [name,setName]=useState(""),[phone,setPhone]=useState(""),[email,setEmail]=useState("");
 const [fulfillment,setFulfillment]=useState<"pickup"|"delivery">("pickup");
 const [neededAt,setNeededAt]=useState(""),[address,setAddress]=useState(""),[notes,setNotes]=useState("");
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[orderNumber,setOrderNumber]=useState("");
 const [requestId,setRequestId]=useState(()=>crypto.randomUUID());
 const [reviewProduct,setReviewProduct]=useState(""),[reviewOrder,setReviewOrder]=useState(""),[reviewPhone,setReviewPhone]=useState("");
 const [reviewName,setReviewName]=useState(""),[reviewText,setReviewText]=useState(""),[reviewRating,setReviewRating]=useState(5);
 const [reviews,setReviews]=useState<Review[]>([]),[reviewNotice,setReviewNotice]=useState(""),[reviewBusy,setReviewBusy]=useState(false);
 const selected=products.filter(p=>(quantities[p.id]||0)>0);
 const total=selected.reduce((sum,p)=>sum+Number(p.selling_price)*quantities[p.id],0);
 const items=selected.map(p=>({product_id:p.id,quantity:quantities[p.id]}));
 function changeQty(id:string,n:number){setQuantities(old=>({...old,[id]:Math.max(0,Math.min(100,Math.trunc(n)||0))}));setNotice("");}
 async function order(){
  if(busy||!orderingAllowed)return;
  if(!items.length){setNotice("Add at least one product.");return;}
  if(!name.trim()||!phone.trim()||!neededAt){setNotice("Enter your name, phone and requested date/time.");return;}
  if(fulfillment==="delivery"&&!address.trim()){setNotice("Enter your delivery address.");return;}
  const date=new Date(neededAt);if(!Number.isFinite(date.getTime())||date.getTime()<=Date.now()){setNotice("Choose a future date and time.");return;}
  setBusy(true);setNotice("");
  try{
   const {data,error}=await createClient().rpc("submit_public_order",{
    p_full_name:name.trim(),p_phone:phone.trim(),p_email:email.trim()||null,
    p_fulfillment:fulfillment,p_required_at:date.toISOString(),
    p_delivery_address:fulfillment==="delivery"?address.trim():null,p_notes:notes.trim()||null,
    p_items:items,p_client_request_id:requestId
   });
   if(error)throw error;
   setOrderNumber(data?.order_no??"");setNotice("Order received for staff confirmation. No payment has been collected.");
   setQuantities({});setRequestId(crypto.randomUUID());
  }catch(e){setNotice(err(e));}finally{setBusy(false);}
 }
 async function openReviews(id:string){
  setReviewProduct(id);setReviewNotice("");setReviews([]);if(!id)return;
  const {data,error}=await createClient().rpc("approved_product_reviews",{p_product_id:id});
  if(error){setReviewNotice(error.message);return;}setReviews(data??[]);
 }
 async function submitReview(){
  if(!reviewProduct||!reviewOrder.trim()||!reviewPhone.trim()||reviewName.trim().length<2||reviewText.trim().length<10){
   setReviewNotice("Enter a completed order number, matching phone, display name and review (10+ characters).");return;
  }
  if(reviewBusy)return;setReviewBusy(true);setReviewNotice("");
  try{
   const {error}=await createClient().rpc("submit_verified_product_review",{
    p_order_no:reviewOrder.trim(),p_phone:reviewPhone.trim(),p_product_id:reviewProduct,
    p_rating:reviewRating,p_display_name:reviewName.trim(),p_review_text:reviewText.trim()
   });
   if(error)throw error;
   setReviewNotice("Thank you! Your verified review will appear after approval.");setReviewText("");setReviewOrder("");
  }catch(e){setReviewNotice(err(e));}finally{setReviewBusy(false);}
 }
 return <main style={{maxWidth:1120,margin:"0 auto",padding:"24px 16px 80px"}}>
  <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12,marginBottom:28}}>
   <div><h1 style={{marginBottom:5}}>{site.business_name||"DS Bakery"}</h1><p>{site.tagline||"Fresh bakery products"}</p></div>
   <div>{site.phone&&<a href={`tel:${site.phone}`}>Call {site.phone}</a>}{site.address_text&&<p>{site.address_text}</p>}</div>
  </header>
  {!orderingAllowed&&<div className="hero" role="status" style={{padding:16}}><strong>Online checkout is not open yet.</strong> Browse our products while the bakery prepares for launch.</div>}
  <h2>Our bakery products</h2><p>Prices are in Ugandan shillings. Staff confirm each order before fulfillment.</p>
  <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:18,margin:"20px 0 32px"}}>
   {products.length===0?<p>No products have been published yet.</p>:products.map(p=><article key={p.id} className="card" style={{padding:14}}>
    {p.image_url?<img src={p.image_url} alt={p.name} loading="lazy" style={{width:"100%",aspectRatio:"4 / 3",objectFit:"cover",borderRadius:12}}/>:<div style={{padding:30,background:"#f2e6d7",borderRadius:12}}>Photo coming soon</div>}
    <p>{p.category_name||"Bakery"}</p><h3>{p.name}</h3><p>{p.description||"Fresh bakery product"}</p><strong>{money(Number(p.selling_price))}</strong>
    <div className="action-row" style={{marginTop:12}}>
     <button className="btn secondary" disabled={!orderingAllowed} aria-label={`Remove one ${p.name}`} onClick={()=>changeQty(p.id,(quantities[p.id]||0)-1)}>−</button>
     <span>{quantities[p.id]||0}</span>
     <button className="btn primary" disabled={!orderingAllowed} aria-label={`Add one ${p.name}`} onClick={()=>changeQty(p.id,(quantities[p.id]||0)+1)}>+</button>
     <button className="btn secondary" onClick={()=>openReviews(p.id)}>Reviews</button>
    </div>
   </article>)}
  </section>
  <section className="card" style={{padding:20,marginBottom:24}}>
   <h2>Your order</h2>
   {selected.length?<ul>{selected.map(p=><li key={p.id}>{p.name} × {quantities[p.id]} — {money(quantities[p.id]*Number(p.selling_price))}</li>)}</ul>:<p>Add products using the + buttons.</p>}
   <strong>Product subtotal: {money(total)}</strong><p>Delivery charges, if any, will be confirmed by staff.</p>
   <div className="grid2">
    <div className="field"><label htmlFor="shop-name">Your name</label><input id="shop-name" maxLength={120} autoComplete="name" value={name} onChange={e=>setName(e.target.value)}/></div>
    <div className="field"><label htmlFor="shop-phone">Phone</label><input id="shop-phone" maxLength={30} type="tel" autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)}/></div>
    <div className="field"><label htmlFor="shop-email">Email (optional)</label><input id="shop-email" maxLength={254} type="email" value={email} onChange={e=>setEmail(e.target.value)}/></div>
    <div className="field"><label htmlFor="shop-time">Requested date and time</label><input id="shop-time" type="datetime-local" value={neededAt} onChange={e=>setNeededAt(e.target.value)}/></div>
    <div className="field"><label htmlFor="shop-fulfillment">Pickup or delivery</label><select id="shop-fulfillment" value={fulfillment} onChange={e=>setFulfillment(e.target.value as "pickup"|"delivery")}><option value="pickup">Pick up at bakery</option>{site.delivery_enabled&&<option value="delivery">Delivery</option>}</select></div>
    {fulfillment==="delivery"&&<div className="field"><label htmlFor="shop-address">Delivery address</label><input id="shop-address" maxLength={300} value={address} onChange={e=>setAddress(e.target.value)}/></div>}
   </div>
   <div className="field"><label htmlFor="shop-notes">Cake message, allergies or instructions (optional)</label><textarea id="shop-notes" maxLength={1000} value={notes} onChange={e=>setNotes(e.target.value)}/></div>
   <button className="btn primary" disabled={!orderingAllowed||busy||!items.length} onClick={order}>{busy?"Submitting…":"Submit order request"}</button>
   {notice&&<p role="status">{notice}</p>}
   {orderNumber&&<p><strong>Save your order number: {orderNumber}</strong></p>}
  </section>
  <section className="card" style={{padding:20}}>
   <h2>Verified customer reviews</h2><p>Review a product after your order is completed. Only your chosen display name will be public after approval.</p>
   <div className="field"><label htmlFor="review-product">Choose product</label><select id="review-product" value={reviewProduct} onChange={e=>openReviews(e.target.value)}><option value="">Choose a product</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
   {reviewProduct&&<>
    {reviews.length?reviews.map((r,i)=><blockquote key={i} style={{padding:12,margin:"8px 0",borderLeft:"3px solid #996d44"}}><strong>{"★".repeat(r.rating)} — {r.display_name}</strong><p>{r.review_text}</p></blockquote>):<p>No approved reviews yet.</p>}
    <div className="grid2">
     <div className="field"><label htmlFor="review-order">Completed order number</label><input id="review-order" maxLength={50} value={reviewOrder} onChange={e=>setReviewOrder(e.target.value)}/></div>
     <div className="field"><label htmlFor="review-phone">Phone used for order</label><input id="review-phone" type="tel" maxLength={30} value={reviewPhone} onChange={e=>setReviewPhone(e.target.value)}/></div>
     <div className="field"><label htmlFor="review-name">Public display name</label><input id="review-name" maxLength={80} value={reviewName} onChange={e=>setReviewName(e.target.value)}/></div>
     <div className="field"><label htmlFor="review-rating">Rating</label><select id="review-rating" value={reviewRating} onChange={e=>setReviewRating(Number(e.target.value))}>{[5,4,3,2,1].map(n=><option key={n} value={n}>{n} stars</option>)}</select></div>
    </div>
    <div className="field"><label htmlFor="review-text">Review (10–500 characters)</label><textarea id="review-text" maxLength={500} value={reviewText} onChange={e=>setReviewText(e.target.value)}/></div>
    <button className="btn primary" disabled={reviewBusy} onClick={submitReview}>{reviewBusy?"Submitting…":"Submit review"}</button>
    {reviewNotice&&<p role="status">{reviewNotice}</p>}
   </>}
  </section>
  <footer style={{marginTop:26,fontSize:13}}>{site.opening_hours&&<p>Opening hours: {site.opening_hours}</p>}<p>For food allergies, confirm ingredients with the bakery before ordering.</p></footer>
 </main>;
}