"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { StaffRole } from "@/lib/permissions";

type MenuItem={href:string;label:string;roles:StaffRole[]};
type MenuSection={title:string;items:MenuItem[]};

const all:StaffRole[]=["owner","manager","cashier","baker","storekeeper"];
const ownerManager:StaffRole[]=["owner","manager"];
const roleLabels:Record<StaffRole,string>={
  owner:"CEO / Owner", manager:"General Manager", baker:"Head Baker",
  storekeeper:"Stock Manager", cashier:"Sales Team",
};

const sections:MenuSection[]=[
  {title:"Daily Operations",items:[
    {href:"/dashboard",label:"Dashboard",roles:ownerManager},
    {href:"/pos",label:"Sales / POS",roles:["owner","manager","cashier"]},
    {href:"/credit-book",label:"Customer Credit Book",roles:["owner","manager","cashier"]},
    {href:"/daily-closing",label:"Daily Closing",roles:ownerManager},
    {href:"/cash-movements",label:"Cash In / Out",roles:["owner","manager","cashier"]},
    {href:"/shifts",label:"Cashier Shifts",roles:["owner","manager","cashier"]},
  ]},
  {title:"Products & Stock",items:[
    {href:"/products",label:"Products & Prices",roles:["owner","manager"]},
    {href:"/inventory",label:"Inventory",roles:["owner","manager","storekeeper","baker"]},
    {href:"/finished-goods",label:"Finished Goods & Batches",roles:["owner","manager","storekeeper","baker"]},
    {href:"/recipes",label:"Recipes & Costing",roles:["owner","manager","baker"]},
    {href:"/stock-movements",label:"Stock Movements",roles:["owner","manager","storekeeper"]},
  ]},
  {title:"Production",items:[
    {href:"/production",label:"Daily Bake Plan",roles:["owner","manager","baker"]},
    {href:"/baker-tasks",label:"Baker Tasks",roles:["owner","manager","baker"]},
    {href:"/waste",label:"Waste Tracking",roles:["owner","manager","baker","storekeeper"]},
    {href:"/production-control",label:"Production Control",roles:ownerManager},
  ]},
  {title:"Purchases & Suppliers",items:[
    {href:"/purchase-orders",label:"Purchase Orders",roles:["owner","manager","storekeeper"]},
    {href:"/suppliers",label:"Suppliers",roles:["owner","manager","storekeeper"]},
    {href:"/purchases",label:"Purchases & Receiving",roles:["owner","manager","storekeeper"]},
    {href:"/supplier-accounts",label:"Supplier Accounts",roles:ownerManager},
  ]},
  {title:"Customers & Growth",items:[
    {href:"/customers",label:"Customers",roles:["owner","manager","cashier"]},
    {href:"/customer-orders",label:"Customer Orders",roles:["owner","manager","cashier","baker"]},
    {href:"/custom-cakes",label:"Custom Cakes",roles:["owner","manager","cashier","baker"]},
    {href:"/deliveries",label:"Deliveries",roles:["owner","manager","cashier"]},
    {href:"/delivery-riders",label:"Delivery Riders",roles:ownerManager},
    {href:"/loyalty",label:"Loyalty & Rewards",roles:["owner","manager","cashier"]},
    {href:"/customer-retention",label:"Customer Retention",roles:["owner","manager","cashier"]},
    {href:"/promotions",label:"Promotions",roles:ownerManager},
    {href:"/communications",label:"WhatsApp Communication",roles:["owner","manager","cashier"]},
    {href:"/message-templates",label:"Message Templates",roles:["owner","manager","cashier"]},
  ]},
  {title:"Finance & Reports",items:[
    {href:"/expenses",label:"Expenses",roles:ownerManager},
    {href:"/payroll",label:"Staff Salaries & Payroll",roles:ownerManager},
    {href:"/reports",label:"Financial Reports",roles:ownerManager},
  ]},
  {title:"Team",items:[
    {href:"/staff",label:"Staff & Roles",roles:["owner"]},
    {href:"/attendance",label:"Attendance",roles:all},
    {href:"/staff-schedule",label:"Staff Schedule",roles:all},
    {href:"/branches",label:"Branches & Locations",roles:["owner"]},
    {href:"/permission-overrides",label:"Individual Permissions",roles:["owner"]},
  ]},
  {title:"Website",items:[{href:"/public-site-settings",label:"Public Website Settings",roles:ownerManager}]},
  {title:"Data Management",items:[{href:"/recycle-bin",label:"Recycle Bin",roles:ownerManager}]},
  {title:"Opening Setup",items:[{href:"/opening-balances",label:"Opening Stock & Customer Debts",roles:ownerManager}]},
];

const systemItems:MenuItem[]=[
  {href:"/system-status",label:"System Status",roles:["owner"]},
  {href:"/go-live-setup",label:"Go-Live Setup",roles:["owner"]},
  {href:"/validation",label:"Production Validation",roles:["owner"]},
  {href:"/staging-connection",label:"Staging Connection",roles:ownerManager},
  {href:"/validation-history",label:"Validation History",roles:ownerManager},
  {href:"/environment",label:"Environment Safety",roles:["owner"]},
  {href:"/production-cutover",label:"Production Cutover",roles:ownerManager},
  {href:"/activity-log",label:"Activity Log",roles:ownerManager},
  {href:"/security",label:"Security",roles:["owner"]},
];

function MenuLinks({items,onNavigate}:{items:MenuItem[];onNavigate?:()=>void}){
  const pathname=usePathname();
  return <div className="sidebar-link-grid">{items.map(item=>{
    const active=pathname===item.href || (item.href!=="/dashboard" && pathname.startsWith(item.href+"/"));
    return <Link key={item.href} href={item.href} className={active?"active":""} onClick={onNavigate}>{item.label}</Link>;
  })}</div>;
}

export default function Sidebar(){
  const router=useRouter();
  const [role,setRole]=useState<StaffRole|null>(null);
  const [name,setName]=useState("DS Bakery Staff");
  const [loaded,setLoaded]=useState(false);
  const [mobileOpen,setMobileOpen]=useState(false);
  const [signingOut,setSigningOut]=useState(false);
  const [operationsOpen,setOperationsOpen]=useState<boolean|null>(null);

  useEffect(()=>{
    let active=true;
    const supabase=createClient();
    (async()=>{
      try{
        const userRes=await supabase.auth.getUser();
        const gateRes=await supabase.rpc("public_ordering_status");
        if(!active)return;
        setOperationsOpen(gateRes.data===true);
        const user=userRes.data.user;
        if(!user)return;
        const {data}=await supabase.from("profiles").select("full_name,role,active,disabled_at").eq("id",user.id).single();
        if(!active)return;
        if(data?.active && !data?.disabled_at){
          setRole(data.role as StaffRole);
          setName(data.full_name || "DS Bakery Staff");
        }
      } finally {
        if(active)setLoaded(true);
      }
    })();
    return()=>{active=false;};
  },[]);

  const visibleSections=useMemo(()=>role
    ?sections.map(s=>({...s,items:s.items.filter(i=>i.roles.includes(role))})).filter(s=>s.items.length>0)
    :[],[role]);
  const visibleSystem=useMemo(()=>role?systemItems.filter(i=>i.roles.includes(role)):[],[role]);

  async function logout(){
    setSigningOut(true);
    try{
      const supabase=createClient();await supabase.auth.signOut();
      router.replace("/login");router.refresh();
    }finally{setSigningOut(false);}
  }

  return <>
    <button className="mobile-nav-toggle" type="button" aria-label="Open DS Bakery menu" onClick={()=>setMobileOpen(true)}>☰ Menu</button>
    {mobileOpen&&<button className="sidebar-backdrop" aria-label="Close menu" onClick={()=>setMobileOpen(false)}/>}
    <aside className={"sidebar "+(mobileOpen?"mobile-open":"")}>
      <div className="sidebar-top-row">
        <div className="brand"><img src="/ds-bakery-logo.png" alt="DS Bakery"/><div><strong>DS Bakery</strong><small>Master System v0.38</small></div></div>
        <button className="sidebar-close" type="button" aria-label="Close menu" onClick={()=>setMobileOpen(false)}>×</button>
      </div>

      <div className="sidebar-profile-card">
        <div className="sidebar-profile-name">{name}</div>
        <div className="sidebar-profile-role">{role?roleLabels[role]:(loaded?"No active staff session":"Loading menu…")}</div>
        <div style={{marginTop:8}}>
          {operationsOpen===null?<span className="badge gold">Checking live status…</span>:operationsOpen?<span className="badge green">Live Operations Enabled</span>:<span className="badge red">Live Operations Locked</span>}
        </div>
        {operationsOpen===false&&role&&<div style={{fontSize:11,marginTop:7,lineHeight:1.45}}>Setup and review screens remain available. Sales, payments, stock and production postings stay protected until final cutover.</div>}
        <Link href="/my-account" className="sidebar-account-link" onClick={()=>setMobileOpen(false)}>My Account</Link>
      </div>

      <nav className="nav" style={{display:"block"}}>
        {visibleSections.map(section=><div key={section.title}><div className="sidebar-section-label">{section.title}</div><MenuLinks items={section.items} onNavigate={()=>setMobileOpen(false)}/></div>)}
        {visibleSystem.length>0&&<details style={{marginTop:18}}><summary className="sidebar-system-summary">System & Setup</summary><div style={{marginTop:6}}><MenuLinks items={visibleSystem} onNavigate={()=>setMobileOpen(false)}/></div></details>}
      </nav>

      <div className="sidebar-footer">
        <button type="button" className="btn secondary sidebar-logout" disabled={signingOut} onClick={logout}>{signingOut?"Signing out…":"Log Out"}</button>
        <div className="sidebar-footer-note">{role==="owner"?"Business tools first • Technical controls stay under System & Setup.":"Your menu shows tools available to your staff role."}</div>
      </div>
    </aside>
  </>;
}
