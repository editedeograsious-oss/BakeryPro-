'use client';
export default function NotificationCenter({notifications}:{notifications:any[]}){
  return <>
    <div className="pagehead"><div><h1>Operational Alerts</h1><p>Live alerts generated from stock, customer credit, supplier balances, orders and delivery conditions.</p></div><span className={notifications.length?"badge gold":"badge green"}>{notifications.length} active</span></div>
    <div className="card">{notifications.length===0?<p>No active operational alerts.</p>:notifications.map(n=><div key={n.id} style={{padding:"12px 0",borderBottom:"1px solid var(--line)"}}><div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}><div><b>{n.title}</b><div style={{color:"var(--muted)",marginTop:4}}>{n.message}</div><small>{String(n.module??"system").replaceAll("_"," ")}</small></div>{n.href&&<a className="btn secondary" href={n.href}>Open</a>}</div></div>)}</div>
  </>;
}
