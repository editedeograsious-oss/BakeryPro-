"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Notice = {
  id:string;
  recipient_id:string;
  event_key:string;
  event_type:"new_order"|"order_status"|"low_stock";
  title:string;
  body:string;
  target_path:"/customer-orders"|"/inventory";
  created_at:string;
  read_at:string|null;
};

export default function NotificationCenter({view="bell"}:{view?:"bell"|"history"}) {
  const [items,setItems]=useState<Notice[]>([]);
  const [unread,setUnread]=useState(0);
  const [open,setOpen]=useState(false);
  const [notice,setNotice]=useState<Notice|null>(null);
  const [failure,setFailure]=useState("");
  const [connected,setConnected]=useState(false);
  const [busy,setBusy]=useState(false);
  const seen=useRef(new Set<string>());

  useEffect(()=>{
    const client=createClient();
    let active=true;
    let uid:string|null=null;
    let channel:ReturnType<typeof client.channel>|null=null;

    async function reload(){
      if(!active||!uid)return;
      const [rows,number]=await Promise.all([
        client.from("staff_notifications")
          .select("id,recipient_id,event_key,event_type,title,body,target_path,created_at,read_at")
          .eq("recipient_id",uid).order("created_at",{ascending:false}).limit(view==="history"?100:30),
        client.from("staff_notifications").select("id",{count:"exact",head:true})
          .eq("recipient_id",uid).is("read_at",null)
      ]);
      if(!active)return;
      if(rows.error||number.error){
        setFailure(rows.error?.message||number.error?.message||"Could not load notifications.");
        return;
      }
      setItems((rows.data||[]) as Notice[]);
      setUnread(number.count||0);
      setFailure("");
    }

    (async()=>{
      try{
        const {data:{user},error}=await client.auth.getUser();
        if(error)throw error;
        if(!active||!user)return;
        uid=user.id;
        await reload();
        if(!active)return;
        channel=client.channel("bakery-notifications-"+user.id+"-"+view)
          .on("postgres_changes",{
            event:"INSERT",schema:"public",table:"staff_notifications",
            filter:"recipient_id=eq."+user.id,
          },payload=>{
            const incoming=payload.new as Notice;
            if(!incoming?.id||incoming.recipient_id!==user.id)return;
            if(seen.current.has(incoming.id))return;
            seen.current.add(incoming.id);
            setItems(old=>[incoming,...old.filter(item=>item.id!==incoming.id)].slice(0,view==="history"?100:30));
            setUnread(n=>n+1);
            if(view==="bell")setNotice(incoming);
          })
          .subscribe(status=>{
            if(!active)return;
            setConnected(status==="SUBSCRIBED");
            if(status==="CHANNEL_ERROR"||status==="TIMED_OUT"){
              setFailure("Live connection interrupted. Alerts will refresh automatically.");
            }
          });
      }catch(e){
        if(active)setFailure(e instanceof Error?e.message:"Could not connect notifications.");
      }
    })();

    const refresh=()=>{if(!("visibilityState" in document)||document.visibilityState==="visible")void reload();};
    // Poll as a backup when the Realtime connection is unavailable or a device sleeps.
    const interval=window.setInterval(refresh,30000);
    document.addEventListener("visibilitychange",refresh);
    return()=>{
      active=false;window.clearInterval(interval);
      document.removeEventListener("visibilitychange",refresh);
      if(channel)void client.removeChannel(channel);
    };
  },[view]);

  async function readOne(item:Notice){
    if(item.read_at)return;
    setBusy(true);
    try{
      const {error}=await createClient().rpc("mark_staff_notification_read",{p_id:item.id});
      if(error)throw error;
      setItems(old=>old.map(n=>n.id===item.id?{...n,read_at:new Date().toISOString()}:n));
      setUnread(n=>Math.max(0,n-1));
      setFailure("");
    }catch(e){setFailure(e instanceof Error?e.message:"Could not mark alert read.");}
    finally{setBusy(false)}
  }

  async function readAll(){
    setBusy(true);
    try{
      const {error}=await createClient().rpc("mark_all_staff_notifications_read");
      if(error)throw error;
      setItems(old=>old.map(n=>({...n,read_at:n.read_at||new Date().toISOString()})));
      setUnread(0);
      setFailure("");
    }catch(e){setFailure(e instanceof Error?e.message:"Could not mark alerts read.");}
    finally{setBusy(false);}
  }

  function formatTime(value:string){
    const date=new Date(value);
    return Number.isFinite(date.valueOf())?date.toLocaleString("en-UG",{dateStyle:"medium",timeStyle:"short"}):"Recently";
  }
  const list=view==="bell"?items.slice(0,5):items;

  return <div style={{position:"relative",marginTop:view==="bell"?12:0}}>
    {view==="bell"?<>
      <button type="button" onClick={()=>setOpen(v=>!v)} aria-expanded={open}
        aria-label={"Notifications"+(unread?" ("+unread+" unread)":"")}
        className="btn secondary" style={{display:"flex",justifyContent:"space-between",width:"100%"}}>
        <span>🔔 Notifications</span>
        <strong aria-live="polite">{unread>99?"99+":unread}</strong>
      </button>
    </>:<header className="pagehead">
      <div><h1>Notification Centre</h1><p>Order updates, urgent stock alerts and messages for your staff role.</p></div>
      <span className="badge gold">{unread} unread</span>
    </header>}

    {(open||view==="history")&&<div className="card" style={{padding:12,marginTop:8,maxHeight:view==="bell"?340:undefined,overflowY:view==="bell"?"auto":undefined}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,marginBottom:12,flexWrap:"wrap"}}>
        <small>{connected?"● Live alerts connected":"● Alerts refresh every 30 seconds"}</small>
        <button className="btn secondary" disabled={busy||unread===0} onClick={readAll}>Mark all as read</button>
      </div>
      {failure&&<p role="alert" style={{color:"#a64024"}}>{failure}</p>}
      {list.length===0?<p>No notifications yet.</p>:list.map(n=><div key={n.id}
        style={{borderTop:"1px solid #e7ded5",padding:"10px 0",opacity:n.read_at?0.68:1}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:6,alignItems:"center"}}>
          <strong>{n.read_at?"":"● "}{n.title}</strong>
          <small>{formatTime(n.created_at)}</small>
        </div>
        <p style={{fontSize:13,margin:"5px 0"}}>{n.body}</p>
        <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"center"}}>
          <Link href={n.target_path} onClick={()=>{void readOne(n);setOpen(false);}}>View details</Link>
          {!n.read_at&&<button type="button" disabled={busy}
            onClick={()=>readOne(n)} style={{background:"none",border:"none",textDecoration:"underline",cursor:"pointer"}}>Mark read</button>}
        </div>
      </div>)}
      {view==="bell"&&<Link href="/notifications" onClick={()=>setOpen(false)}
        style={{display:"block",textAlign:"center",marginTop:12}}>See notification history</Link>}
    </div>}

    {view==="bell"&&notice&&<div role="status" aria-live="polite"
      style={{position:"fixed",top:18,right:18,zIndex:1200,width:"min(360px, calc(100vw - 36px))",background:"#fffaf3",color:"#372c23",border:"2px solid #a47842",borderRadius:12,padding:16,boxShadow:"0 12px 35px #0003"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
        <strong>🔔 {notice.title}</strong>
        <button aria-label="Close notification" type="button" onClick={()=>setNotice(null)}>×</button>
      </div>
      <p style={{margin:"10px 0"}}>{notice.body}</p>
      <div style={{display:"flex",gap:12}}>
        <Link href={notice.target_path} onClick={()=>{void readOne(notice);setNotice(null);}}>View details</Link>
        <button type="button" onClick={()=>{void readOne(notice);setNotice(null);}} disabled={busy}>Mark read</button>
      </div>
    </div>}
  </div>;
}
