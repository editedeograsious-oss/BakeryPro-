"use client";

import {useEffect,useState} from "react";
import {createClient} from "@/lib/supabase/client";
import Link from "next/link";

type History={order_no:string;status:string;fulfillment:string;total_amount:number;created_at:string;required_at:string};
export default function CustomerAccount(){
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [mode,setMode]=useState<"login"|"register"|"reset">("login");
  const [current,setCurrent]=useState<{id:string;email:string;verified:boolean}|null>(null);
  const [orders,setOrders]=useState<History[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  async function load(){
    const sb=createClient();
    const {data:{user},error}=await sb.auth.getUser();
    if(error){setMessage(error.message);setCurrent(null);setLoading(false);return;}
    if(!user){setCurrent(null);setOrders([]);setLoading(false);return;}
    const verified=Boolean(user.email_confirmed_at);
    setCurrent({id:user.id,email:user.email||"",verified});
    setEmail(user.email||"");
    if(verified){
      const result=await sb.rpc("customer_my_orders");
      if(result.error)setMessage(result.error.message);
      else setOrders((result.data||[]) as History[]);
    }
    setLoading(false);
  }
  useEffect(()=>{void load();const sb=createClient();const {data:{subscription}}=sb.auth.onAuthStateChange(()=>{void load();});return()=>subscription.unsubscribe();},[]);

  async function submit(){
    const addr=email.trim().toLowerCase();
    if(!addr||!addr.includes("@")){setMessage("Enter a valid email address.");return;}
    if(mode!=="reset"&&password.length<8){setMessage("Enter a password of at least 8 characters.");return;}
    setBusy(true);setMessage("");
    const sb=createClient();
    try{
      if(mode==="login"){
        const {error}=await sb.auth.signInWithPassword({email:addr,password});
        if(error)throw error;
        setPassword("");
        await load();
        setMessage("Signed in. You may return to the bakery shop.");
      }else if(mode==="register"){
        if(password.length<12)throw Error("Create a strong password of at least 12 characters.");
        const {error}=await sb.auth.signUp({
          email:addr,password,
          options:{emailRedirectTo:window.location.origin+"/shop/auth/callback"}
        });
        if(error)throw error;
        setPassword("");
        setMessage("Check your email for an account confirmation link before ordering. If your email is already registered, sign in instead.");
      }else{
        const {error}=await sb.auth.resetPasswordForEmail(addr,{redirectTo:window.location.origin+"/auth/callback"});
        if(error)throw error;
        setMessage("If this account exists, a password reset email will arrive shortly.");
      }
    }catch(e){setMessage(e instanceof Error?e.message:"Could not complete authentication.");}
    finally{setBusy(false);}
  }

  async function signOut(){
    setBusy(true);const {error}=await createClient().auth.signOut();
    if(error)setMessage(error.message);else{setCurrent(null);setOrders([]);setPassword("");setMessage("You have signed out.");}
    setBusy(false);
  }
  return <main style={{maxWidth:670,margin:"0 auto",padding:"32px 16px 80px"}}>
    <p><Link href="/shop">← Back to the bakery shop</Link></p>
    <h1>DS Bakery Customer Account</h1>
    <p>Everyone can browse our bakery products. A verified customer account is required before placing an order.</p>
    {loading?<p>Checking your account…</p>:current?<>
      <section className="card" style={{padding:20}}>
        <h2>Signed in</h2><p>{current.email}</p>
        <p>{current.verified?"Email verified — ordering is available when the bakery is open.":"Please verify your email to place orders."}</p>
        <div className="action-row"><Link className="btn primary" href="/shop">Continue shopping</Link>
          <button className="btn secondary" disabled={busy} onClick={signOut}>Sign out</button></div>
      </section>
      {current.verified&&<section className="card" style={{padding:20,marginTop:14}}>
        <h2>My bakery orders</h2><p>Your orders are tied to your verified account, not merely to a phone number.</p>
        {orders.length===0?<p>No orders linked to this account yet.</p>:<div className="tablewrap"><table><thead><tr><th>Order</th><th>Status</th><th>Total</th><th>Requested</th></tr></thead>
        <tbody>{orders.map(o=><tr key={o.order_no}><td>{o.order_no}</td><td>{o.status}</td><td>UGX {Number(o.total_amount).toLocaleString()}</td>
          <td>{new Date(o.required_at).toLocaleString()}</td></tr>)}</tbody></table></div>}
      </section>}
    </>:<section className="card" style={{padding:20}}>
      <div className="action-row"><button className="btn secondary" onClick={()=>{setMode("login");setMessage("");}}>Sign in</button>
        <button className="btn secondary" onClick={()=>{setMode("register");setMessage("");}}>Create account</button>
        <button className="btn secondary" onClick={()=>{setMode("reset");setMessage("");}}>Forgot password</button></div>
      <h2>{mode==="login"?"Customer sign-in":mode==="register"?"Create customer account":"Reset password"}</h2>
      <div className="field"><label htmlFor="customer-email">Email address</label><input id="customer-email" type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></div>
      {mode!=="reset"&&<div className="field"><label htmlFor="customer-password">Password</label>
        <input id="customer-password" type="password" autoComplete={mode==="register"?"new-password":"current-password"} value={password} onChange={e=>setPassword(e.target.value)}/></div>}
      <button className="btn primary" disabled={busy} onClick={submit}>{busy?"Please wait…":mode==="login"?"Sign in":mode==="register"?"Create account":"Email reset link"}</button>
      <p style={{fontSize:13}}>Never share your account password with bakery staff. Staff have separate management accounts.</p>
    </section>}
    {message&&<p role="status" className="hero" style={{padding:12,marginTop:12}}>{message}</p>}
  </main>;
}
