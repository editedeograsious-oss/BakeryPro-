"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Item={id:string;name:string;status:string;selling_price:number;image_url:string|null;online_available:boolean};
type Review={id:string;product_id:string;display_name:string;rating:number;review_text:string;status:string;created_at:string};
const fmt=(e:unknown)=>e instanceof Error?e.message:"Unable to complete the request";
export default function OwnerCommerce({products,reviews}:{products:Item[];reviews:Review[]}){
 const router=useRouter();const [busy,setBusy]=useState<string|null>(null);const [notice,setNotice]=useState("");
 const [files,setFiles]=useState<Record<string,File|undefined>>({});
 async function upload(product:Item){
  const file=files[product.id];if(!file){setNotice("Choose a product photo first.");return;}
  if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>5*1024*1024||file.size<=0){setNotice("Only JPEG, PNG or WebP images up to 5 MB are allowed.");return;}
  const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
  const path=`${product.id}/${crypto.randomUUID()}.${ext}`;
  setBusy(product.id);setNotice("");
  try{
   const client=createClient();
   const result=await client.storage.from("bakery-product-images").upload(path,file,{contentType:file.type,cacheControl:"3600",upsert:false});
   if(result.error)throw result.error;
   const {error}=await client.rpc("owner_set_product_image",{p_product_id:product.id,p_path:path});
   if(error)throw error;
   setNotice(`Photo uploaded for ${product.name}.`);setFiles(s=>({...s,[product.id]:undefined}));router.refresh();
  }catch(e){setNotice(fmt(e));}finally{setBusy(null)}
 }
 async function publish(product:Item){
  setBusy(product.id);setNotice("");
  try{
   const {error}=await createClient().rpc("owner_set_product_online",{p_product_id:product.id,p_available:!product.online_available});
   if(error)throw error;
   setNotice(`Online availability updated for ${product.name}.`);router.refresh();
  }catch(e){setNotice(fmt(e));}finally{setBusy(null)}
 }
 async function moderate(review:Review,approve:boolean){
  setBusy(review.id);setNotice("");
  try{
   const {error}=await createClient().rpc("owner_moderate_product_review",{p_review_id:review.id,p_approve:approve});
   if(error)throw error;
   setNotice(approve?"Review approved for the shop.":"Review hidden from the shop.");router.refresh();
  }catch(e){setNotice(fmt(e));}finally{setBusy(null)}
 }
 return <>
  <div className="pagehead"><div><h1>Online Shop & Product Photos</h1><p>CEO controls which products customers can order, photos and public reviews.</p></div></div>
  <div className="hero" style={{padding:16,marginBottom:14}}><strong>CEO-only publishing.</strong> New products are hidden until you upload a photo and publish them. Record stock through Purchases, Production and Inventory—not by changing website quantities.</div>
  {notice&&<p role="status" className="hero" style={{padding:12}}>{notice}</p>}
  <p><a className="btn secondary" href="/products">Add / edit products</a> <a className="btn secondary" href="/shop">Preview customer shop</a></p>
  <div className="tablewrap"><table><thead><tr><th>Photo</th><th>Product</th><th>Price</th><th>Online status</th><th>Choose photo</th><th>Actions</th></tr></thead><tbody>
   {products.length===0?<tr><td colSpan={6}>No products found. Add products first.</td></tr>:products.map(p=><tr key={p.id}>
    <td>{p.image_url?<img src={p.image_url} alt={p.name} style={{width:90,height:68,objectFit:"cover",borderRadius:6}}/>:"No photo"}</td>
    <td><strong>{p.name}</strong><br/><small>{p.status}</small></td>
    <td>UGX {Number(p.selling_price).toLocaleString()}</td>
    <td><span className={p.online_available?"badge green":"badge gold"}>{p.online_available?"Available online":"Hidden"}</span></td>
    <td><input aria-label={`Photo for ${p.name}`} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy!==null} onChange={e=>setFiles(s=>({...s,[p.id]:e.target.files?.[0]}))}/><small>JPEG, PNG or WebP; max 5 MB</small></td>
    <td><div className="action-row"><button className="btn secondary" disabled={busy!==null||!files[p.id]} onClick={()=>upload(p)}>Upload Photo</button><button className="btn primary" disabled={busy!==null||p.status!=="active"||(!p.online_available&&!p.image_url)} onClick={()=>publish(p)} title={!p.image_url&&!p.online_available?"Upload a photo before publishing":undefined}>{p.online_available?"Unpublish":"Publish"}</button></div></td>
   </tr>)}
  </tbody></table></div>
  <h2 style={{marginTop:26}}>Customer Review Moderation</h2><p>Reviews are hidden until approved. Only customers with completed orders can submit them.</p>
  <div className="tablewrap"><table><thead><tr><th>Product</th><th>Rating</th><th>Display name</th><th>Review</th><th>Status</th><th>Action</th></tr></thead><tbody>
   {reviews.length===0?<tr><td colSpan={6}>No customer reviews yet.</td></tr>:reviews.map(r=><tr key={r.id}>
    <td>{products.find(p=>p.id===r.product_id)?.name??"Product"}</td><td>{"★".repeat(r.rating)}</td><td>{r.display_name}</td><td>{r.review_text}</td><td>{r.status}</td>
    <td><div className="action-row"><button className="btn primary" disabled={busy!==null||r.status==="approved"} onClick={()=>moderate(r,true)}>Approve</button><button className="btn secondary" disabled={busy!==null||r.status==="rejected"} onClick={()=>moderate(r,false)}>Reject / Hide</button></div></td>
   </tr>)}
  </tbody></table></div>
 </>;
}