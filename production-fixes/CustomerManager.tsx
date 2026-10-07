'use client';

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ugx } from "@/lib/costing";
import RecycleActionButton from "@/components/admin/RecycleActionButton";

export default function CustomerManager({customers,live,canPrepareOpening=false,canReadCredit=true}:{customers:any[];live:boolean;canPrepareOpening?:boolean;canReadCredit?:boolean}){
  const router=useRouter();
  const [query,setQuery]=useState("");
  const [selected,setSelected]=useState<any|null>(null);
  const [fullName,setFullName]=useState("");
  const [phone,setPhone]=useState("");
  const [email,setEmail]=useState("");
  const [address,setAddress]=useState("");
  const [birthday,setBirthday]=useState("");
  const [notes,setNotes]=useState("");
  const [whatsapp,setWhatsapp]=useState(false);
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const requestId=useRef(crypto.randomUUID());

  const shown=useMemo(()=>customers.filter(c=>(`${c.full_name} ${c.phone??""} ${c.email??""}`).toLowerCase().includes(query.toLowerCase())),[customers,query]);
  const customerBalance=(c:any)=>canReadCredit?Number(c.total_outstanding_balance??(Math.max(Number(c.outstanding_balance||0),0)+Number(c.credit_balance_due||0))):Math.max(Number(c.outstanding_balance||0),0);
  const totalBalance=customers.reduce((s,c)=>s+customerBalance(c),0);

  function clear(){
    setSelected(null);setFullName("");setPhone("");setEmail("");setAddress("");setBirthday("");setNotes("");setWhatsapp(false);
    requestId.current=crypto.randomUUID();
  }

  function edit(c:any){
    setSelected(c);setFullName(c.full_name??"");setPhone(c.phone??"");setEmail(c.email??"");setAddress(c.address??"");setBirthday(c.birthday??"");setNotes(c.notes??"");setWhatsapp(Boolean(c.whatsapp_opt_in));
  }

  async function save(){
    if(!fullName.trim()){setMessage("Customer name is required.");return;}
    if(!live){setMessage("Demo mode: customer save simulated.");return;}
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {data,error}=await supabase.rpc("save_customer",{
        p_customer_id:selected?.customer_id??null,
        p_full_name:fullName.trim(),
        p_phone:phone.trim()||null,
        p_email:email.trim()||null,
        p_address:address.trim()||null,
        p_birthday:birthday||null,
        p_notes:notes.trim()||null,
        p_whatsapp_opt_in:whatsapp,
        p_client_request_id:requestId.current,
      });
      if(error)throw error;
      setMessage("Customer saved.");
      clear();
      router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not save customer.");}
    finally{setBusy(false);}
  }

  return <>
    <div className="pagehead">
      <div><h1>Customers</h1><p>Shared customer profiles, order value, balances and communication preference.</p></div>
      <div className="action-row">{canPrepareOpening&&<a className="btn secondary" href="/opening-balances">Opening Customer Debts</a>}<a className="btn secondary" href="/credit-book">Credit Book</a><button className="btn primary" onClick={clear}>+ New Customer</button></div>
    </div>
    {message&&<div className="hero" style={{padding:14}}><b>{message}</b></div>}

    <div className="grid4">
      <div className="card stat"><div className="label">Customers</div><div className="value">{customers.length}</div></div>
      <div className="card stat"><div className="label">Customer Orders</div><div className="value">{customers.reduce((s,c)=>s+Number(c.order_count||0),0)}</div></div>
      <div className="card stat"><div className="label">{canReadCredit?"Outstanding Balances":"Outstanding Order Balances"}</div><div className="value">{ugx(totalBalance)}</div></div>
      <div className="card stat"><div className="label">WhatsApp Opted In</div><div className="value">{customers.filter(c=>c.whatsapp_opt_in).length}</div></div>
    </div>

    <div className="grid2" style={{marginTop:16}}>
      <div className="card">
        <h3 style={{color:"var(--brown)",marginTop:0}}>{selected?"Edit Customer":"Add Customer"}</h3>
        <div className="field"><label>Full name</label><input value={fullName} onChange={e=>setFullName(e.target.value)}/></div>
        <div className="grid2">
          <div className="field"><label>Phone</label><input value={phone} onChange={e=>setPhone(e.target.value)}/></div>
          <div className="field"><label>Email</label><input value={email} onChange={e=>setEmail(e.target.value)}/></div>
        </div>
        <div className="grid2">
          <div className="field"><label>Address</label><input value={address} onChange={e=>setAddress(e.target.value)}/></div>
          <div className="field"><label>Birthday</label><input type="date" value={birthday} onChange={e=>setBirthday(e.target.value)}/></div>
        </div>
        <div className="field"><label>Notes</label><input value={notes} onChange={e=>setNotes(e.target.value)}/></div>
        <label style={{display:"flex",gap:8,alignItems:"center",margin:"10px 0 14px"}}><input type="checkbox" checked={whatsapp} onChange={e=>setWhatsapp(e.target.checked)}/> WhatsApp marketing/birthday opt-in</label>
        <button className="btn primary" disabled={busy} onClick={save}>{busy?"Saving…":"Save Customer"}</button>
      </div>

      <div className="card">
        <h3 style={{color:"var(--brown)",marginTop:0}}>Search</h3>
        <div className="field"><label>Customer name / phone / email</label><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search customer…"/></div>
        <p style={{color:"var(--muted)",fontSize:12}}>{canReadCredit?"Amount due includes unpaid customer orders and Credit Book debts. Opening drafts stay separate until they are reviewed and posted with explicit approval.":"Order balances are shown. Your account does not have access to Credit Book balances."}</p>
        {canPrepareOpening&&<p>Add the customer profile first, then use <a href="/opening-balances">Opening Customer Debts</a> for amounts owed before launch.</p>}
      </div>
    </div>

    <div className="tablewrap" style={{marginTop:16}}>
      <table><thead><tr><th>Customer</th><th>Phone</th><th>Orders</th><th>Order Value</th><th>Order Due</th><th>Credit Book Due</th><th>{canReadCredit?"Total Due":"Order Due Only"}</th><th>WhatsApp</th><th>Last Activity</th><th>Action</th></tr></thead>
      <tbody>{shown.length===0?<tr><td colSpan={10}>No customers found.</td></tr>:shown.map(c=><tr key={c.customer_id}>
        <td><b>{c.full_name}</b><br/><small>{c.email??""}</small></td><td>{c.phone??"—"}</td><td>{Number(c.order_count||0)}</td><td>{ugx(Number(c.total_order_value||0))}</td>
        <td>{ugx(Math.max(Number(c.outstanding_balance||0),0))}</td><td>{canReadCredit?ugx(Number(c.credit_balance_due||0)):"Restricted"}</td><td>{customerBalance(c)>0?<span className="badge gold">{ugx(customerBalance(c))}</span>:<span className="badge green">Clear</span>}</td>
        <td><span className={c.whatsapp_opt_in?"badge green":"badge gold"}>{c.whatsapp_opt_in?"Opted In":"No Opt-In"}</span></td>
        <td>{c.last_order_at||c.last_credit_at?new Date(Math.max(new Date(c.last_order_at??0).getTime(),new Date(c.last_credit_at??0).getTime())).toLocaleDateString():"—"}</td><td><div className="action-row"><button className="btn secondary" onClick={()=>edit(c)}>Edit</button><RecycleActionButton entityType="customer" entityId={c.customer_id} label={c.full_name} live={live} onMessage={setMessage}/></div></td>
      </tr>)}</tbody></table>
    </div>
  </>;
}
