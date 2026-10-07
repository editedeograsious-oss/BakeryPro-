'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Manual={
  catalog_verified:boolean;
  opening_stock_verified:boolean;
  payment_methods_verified:boolean;
  public_site_verified:boolean;
  staff_accounts_verified:boolean;
  backup_plan_verified:boolean;
};

export default function GoLiveSetupManager({readiness,live}:{readiness:any;live:boolean}){
  const router=useRouter();
  const initial=readiness?.manual??{};
  const [manual,setManual]=useState<Manual>({
    catalog_verified:Boolean(initial.catalog_verified),
    opening_stock_verified:Boolean(initial.opening_stock_verified),
    payment_methods_verified:Boolean(initial.payment_methods_verified),
    public_site_verified:Boolean(initial.public_site_verified),
    staff_accounts_verified:Boolean(initial.staff_accounts_verified),
    backup_plan_verified:Boolean(initial.backup_plan_verified),
  });
  const [notes,setNotes]=useState(readiness?.notes??"");
  const [confirmation,setConfirmation]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);

  function toggle(key:keyof Manual){
    setManual(v=>({...v,[key]:!v[key]}));
  }

  async function saveChecklist(){
    if(!live){setMessage("Demo mode: checklist save simulated.");return;}
    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {error}=await supabase.rpc("update_go_live_setup_checklist",{
        p_catalog_verified:manual.catalog_verified,
        p_opening_stock_verified:manual.opening_stock_verified,
        p_payment_methods_verified:manual.payment_methods_verified,
        p_public_site_verified:manual.public_site_verified,
        p_staff_accounts_verified:manual.staff_accounts_verified,
        p_backup_plan_verified:manual.backup_plan_verified,
        p_notes:notes.trim()||null,
      });
      if(error)throw error;
      setMessage("Go-live checklist saved. Any previous completion was cleared for re-verification.");
      router.refresh();
    }catch(e){
      setMessage(e instanceof Error?e.message:"Could not save go-live checklist.");
    }finally{
      setBusy(false);
    }
  }

  async function complete(){
    if(confirmation!=="COMPLETE GO LIVE SETUP"){
      setMessage("Type COMPLETE GO LIVE SETUP exactly.");
      return;
    }
    if(!live){setMessage("Demo mode: go-live completion simulated.");return;}

    setBusy(true);setMessage("");
    try{
      const supabase=createClient();
      const {error}=await supabase.rpc("complete_go_live_setup",{p_confirmation:confirmation});
      if(error)throw error;
      setMessage("Go-live setup completed and audited.");
      setConfirmation("");
      router.refresh();
    }catch(e){
      setMessage(e instanceof Error?e.message:"Could not complete go-live setup.");
    }finally{
      setBusy(false);
    }
  }

  const auto=readiness?.automatic??{};
  const autoRows=[
    ["Active Owner",Boolean(auto.active_owner),auto.active_owner?"Owner account exists":"No active Owner account"],
    ["Active Staff",Number(auto.active_staff_count)>0,`${Number(auto.active_staff_count||0)} active staff account(s)`],
    ["Active Products",Number(auto.active_products)>0,`${Number(auto.active_products||0)} active priced product(s)`],
    ["Raw Materials",Number(auto.active_raw_materials)>0,`${Number(auto.active_raw_materials||0)} active raw material(s)`],
    ["Suppliers",Number(auto.active_suppliers)>0,`${Number(auto.active_suppliers||0)} active supplier(s)`],
    ["Negative Stock",Number(auto.negative_stock_count)===0,`${Number(auto.negative_stock_count||0)} negative stock balance(s)`],
    ["Unposted Opening Drafts",Number(auto.unposted_opening_drafts||0)===0,`${Number(auto.unposted_opening_drafts||0)} opening draft(s) require review and posting before completion`],
    ["Recipe Coverage",Number(auto.recipe_gap_count)===0,`${Number(auto.recipe_gap_count||0)} tracked product(s) missing active recipe`],
    ["Public Contacts",Boolean(auto.public_site_contact_ready),auto.public_site_contact_ready?"Public business contact details ready":"Public contact details incomplete"],
    ["Passing Staging Validation",Boolean(auto.passing_staging_validation),auto.passing_staging_validation?"Passing staging evidence exists":"Passing staging validation still required"],
  ] as const;

  const manualRows:[
    keyof Manual,string,string,string
  ][]=[
    ["catalog_verified","Catalog verified","Check products, selling prices, categories and active/inactive status.","/products"],
    ["opening_stock_verified","Opening stock verified","Confirm counted raw materials, finished goods and existing customer debts. Opening drafts require Owner review before posting.","/opening-balances"],
    ["payment_methods_verified","Payment methods verified","Test Cash, MTN MoMo and Airtel Money transaction/reference handling.","/pos"],
    ["public_site_verified","Public website verified","Check Kiwafu Lugonjo, telephone, WhatsApp, email, TikTok and menu prices.","/public-site-settings"],
    ["staff_accounts_verified","Staff accounts verified","Confirm actual bakery staff roles and disable temporary/unneeded accounts.","/staff"],
    ["backup_plan_verified","Backup plan verified","Confirm backup destination, schedule and a successful restore test.","/validation"],
  ];

  return <>
    <div className="pagehead">
      <div><h1>Go-Live Setup</h1><p>Final business-data and operating checks before the first real production transaction.</p></div>
      <span className={readiness?.setup_completed?"badge green":"badge gold"}>{readiness?.setup_completed?"SETUP COMPLETE":"SETUP IN PROGRESS"}</span>
    </div>

    {message&&<div className="hero" style={{padding:14}}><b>{message}</b></div>}

    <div className="grid4">
      <div className="card stat"><div className="label">Environment</div><div className="value" style={{fontSize:20}}>{readiness?.environment_mode??"unconfigured"}</div></div>
      <div className="card stat"><div className="label">Automatic Gate</div><div className="value" style={{fontSize:20}}>{readiness?.automatic_gate??"fail"}</div></div>
      <div className="card stat"><div className="label">Manual Gate</div><div className="value" style={{fontSize:20}}>{readiness?.manual_gate??"fail"}</div></div>
      <div className="card stat"><div className="label">Staging Evidence</div><div className="value" style={{fontSize:20}}>{readiness?.staging_validation_gate??"warn"}</div></div>
    </div>

    <div className="grid2" style={{marginTop:16}}>
      <div className="card">
        <h3 style={{color:"var(--brown)",marginTop:0}}>Automatic Readiness</h3>
        {autoRows.map(([name,ok,detail])=><div key={name} style={{padding:"10px 0",borderBottom:"1px solid #f0e6da"}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:12}}><b>{name}</b><span className={ok?"badge green":"badge red"}>{ok?"PASS":"ACTION"}</span></div>
          <p style={{color:"var(--muted)",fontSize:12,margin:"5px 0 0"}}>{detail}</p>
        </div>)}
      </div>

      <div className="card">
        <h3 style={{color:"var(--brown)",marginTop:0}}>Owner Verification Checklist</h3>
        {manualRows.map(([key,title,detail,href])=><div key={key} style={{padding:"10px 0",borderBottom:"1px solid #f0e6da"}}>
          <label style={{display:"flex",gap:9,alignItems:"flex-start"}}>
            <input type="checkbox" checked={manual[key]} onChange={()=>toggle(key)}/>
            <span><b>{title}</b><br/><span style={{color:"var(--muted)",fontSize:12,lineHeight:1.5}}>{detail}</span><br/><a href={href} style={{fontSize:12}}>Open related screen</a></span>
          </label>
        </div>)}
        <div className="field" style={{marginTop:14}}><label>Verification notes</label><textarea rows={4} value={notes} onChange={e=>setNotes(e.target.value)}/></div>
        <button className="btn primary" disabled={busy} onClick={saveChecklist}>Save Checklist</button>
      </div>
    </div>

    <div className="card" style={{marginTop:16}}>
      <h3 style={{color:"var(--brown)",marginTop:0}}>Final Owner Sign-Off</h3>
      <p style={{color:"var(--muted)",lineHeight:1.6}}>Completion is accepted only when the automatic gate passes, all six Owner checks are verified, and a passing staging validation run exists.</p>
      <div className="field"><label>Type COMPLETE GO LIVE SETUP</label><input value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></div>
      <button className="btn secondary" disabled={busy||Boolean(readiness?.setup_completed)} onClick={complete}>{readiness?.setup_completed?"Setup Already Completed":"Complete Go-Live Setup"}</button>
      {readiness?.completed_at&&<p><b>Completed:</b> {new Date(readiness.completed_at).toLocaleString()}</p>}
    </div>

    <div className="hero" style={{marginTop:16}}>
      <h2>Important order of operations</h2>
      <p>Complete this setup in Staging after realistic data/testing. Then configure the real environment as Production, re-check launch readiness, and only enable Production Lock after the final deployment/restore checks are complete.</p>
    </div>
  </>;
}
