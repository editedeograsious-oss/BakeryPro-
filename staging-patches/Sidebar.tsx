"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { StaffRole } from "@/lib/permissions";

type MenuItem={href:string;label:string;roles:StaffRole[]};
type MenuSection={title:string;items:MenuItem[]};

const all:StaffRole[]=["owner","manager","cashier","baker","storekeeper"];
const ownerManager:StaffRole[]=["owner","manager"];

const sections:MenuSection[]=[
  {title:"Daily Operations",items:[
    {href:"/dashboard",label:"Dashboard",roles:ownerManager},
    {href:"/pos",label:"Sales / POS",roles:["owner","manager","cashier"]},
    {href:"/daily-closing",label:"Daily Closing",roles:ownerManager},
    {href:"/cash-movements",label:"Cash In / Out",roles:["owner","manager","cashier"]},
    {href:"/shifts",label:"Cashier Shifts",roles:["owner","manager","cashier"]},
  ]},
  {title:"Products & Stock",items:[
    {href:"/products",label:"Products & Prices",roles:["owner","manager"]},
    {href:"/inventory",label:"Inventory",roles:["owner","manager","storekeeper","baker"]},
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
    {href:"/communications",label:"WhatsApp Communication",roles:["owner","manager","cashier"]},
    {href:"/message-templates",label:"Message Templates",roles:["owner","manager","cashier"]},
  ]},
  {title:"Finance & Reports",items:[
    {href:"/expenses",label:"Expenses",roles:ownerManager},
    {href:"/reports",label:"Financial Reports",roles:ownerManager},
  ]},
  {title:"Team",items:[
    {href:"/staff",label:"Staff & Roles",roles:["owner"]},
    {href:"/attendance",label:"Attendance",roles:all},
    {href:"/staff-schedule",label:"Staff Schedule",roles:all},
    {href:"/permission-overrides",label:"Individual Permissions",roles:["owner"]},
  ]},
  {title:"Website",items:[
    {href:"/public-site-settings",label:"Public Website Settings",roles:ownerManager},
  ]},
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

function SectionLabel({children}:{children:string}){
  return <div style={{margin:"18px 10px 6px",fontSize:10,fontWeight:900,letterSpacing:".12em",textTransform:"uppercase",color:"var(--muted)"}}>{children}</div>;
}

function MenuLinks({items}:{items:MenuItem[]}){
  return <div style={{display:"grid",gap:4}}>
    {items.map(item=><Link key={item.href} href={item.href}>{item.label}</Link>)}
  </div>;
}

export default function Sidebar(){
  const [role,setRole]=useState<StaffRole|null>(null);
  const [name,setName]=useState("DS Bakery Staff");
  const [loaded,setLoaded]=useState(false);

  useEffect(()=>{
    let active=true;
    const supabase=createClient();
    (async()=>{
      try{
        const {data:{user}}=await supabase.auth.getUser();
        if(!user){ if(active)setLoaded(true); return; }
        const {data}=await supabase.from("profiles")
          .select("full_name,role,active,disabled_at")
          .eq("id",user.id)
          .single();
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

  const visibleSections=useMemo(()=>{
    if(!role)return [];
    return sections.map(section=>({...section,items:section.items.filter(i=>i.roles.includes(role))})).filter(section=>section.items.length>0);
  },[role]);

  const visibleSystem=useMemo(()=>role?systemItems.filter(i=>i.roles.includes(role)):[],[role]);

  return <aside className="sidebar" style={{overflowY:"auto"}}>
    <div className="brand">
      <img src="/ds-bakery-logo.png" alt="DS Bakery"/>
      <div><strong>DS Bakery</strong><small>Master System v0.35</small></div>
    </div>

    <div style={{marginBottom:12,padding:"10px 12px",border:"1px solid var(--line)",borderRadius:12,background:"var(--cream)"}}>
      <div style={{fontWeight:850,color:"var(--brown)",fontSize:12,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{name}</div>
      <div style={{fontSize:10,color:"var(--muted)",textTransform:"uppercase",letterSpacing:".08em",marginTop:3}}>
        {role ?? (loaded?"No active staff session":"Loading menu…")}
      </div>
    </div>

    <nav className="nav" style={{display:"block"}}>
      {visibleSections.map(section=><div key={section.title}>
        <SectionLabel>{section.title}</SectionLabel>
        <MenuLinks items={section.items}/>
      </div>)}

      {visibleSystem.length>0&&<details style={{marginTop:18}}>
        <summary style={{cursor:"pointer",listStyle:"none",padding:"11px 12px",borderRadius:12,fontWeight:900,color:"var(--brown)",background:"var(--cream2)",border:"1px solid var(--line)"}}>System & Setup</summary>
        <div style={{marginTop:6}}><MenuLinks items={visibleSystem}/></div>
      </details>}
    </nav>

    <div style={{marginTop:24,padding:"12px",borderTop:"1px solid var(--line)",color:"var(--muted)",fontSize:11,lineHeight:1.5}}>
      {role==="owner"?"Business tools first • Technical controls are grouped under System & Setup.":"Your menu shows only tools available to your staff role."}
    </div>
  </aside>;
}
