"use client";
import {useEffect,useRef} from "react";
import {usePathname,useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase/client";

type StaffRole="owner"|"manager"|"cashier"|"baker"|"storekeeper";
export default function SharedDataRefresh({role}:{role:StaffRole}){
 const pathname=usePathname();
 const router=useRouter();
 const lastRefresh=useRef(0);
 useEffect(()=>{
  const client=createClient();
  const pages=new Set(["/dashboard","/reports","/products","/inventory","/finished-goods","/customer-orders","/stock-management","/stock-movements","/production","/baker-tasks","/purchases"]);
  if(!pages.has(pathname))return;
  const tables=role==="owner"||role==="manager"
   ?["sales","customer_orders","products","raw_materials"]
   :role==="cashier"?["sales","customer_orders","products"]
   :role==="baker"?["customer_orders","products","raw_materials"]
   :["raw_materials","products"];
  let active=true;
  let scheduled=0;
  function refresh(){
   if(!active||document.visibilityState!=="visible")return;
   const el=document.activeElement as HTMLElement|null;
   if(el&&el.matches("input, textarea, select, [contenteditable='true']"))return;
   if(Date.now()-lastRefresh.current<3500)return;
   lastRefresh.current=Date.now();
   router.refresh();
  }
  const channel=client.channel("ds-shared-sync-"+role+"-"+pathname)
   .on("postgres_changes",{event:"*",schema:"public",table:tables[0]},()=>{window.clearTimeout(scheduled);scheduled=window.setTimeout(refresh,1300);});
  for(const table of tables.slice(1)){
   channel.on("postgres_changes",{event:"*",schema:"public",table},()=>{
    window.clearTimeout(scheduled);scheduled=window.setTimeout(refresh,1300);
   });
  }
  channel.subscribe();
  const wake=()=>{if(document.visibilityState==="visible")refresh();};
  const interval=window.setInterval(refresh,60000);
  document.addEventListener("visibilitychange",wake);
  return()=>{active=false;window.clearTimeout(scheduled);window.clearInterval(interval);document.removeEventListener("visibilitychange",wake);void client.removeChannel(channel);};
 },[pathname,role,router]);
 return null;
}
