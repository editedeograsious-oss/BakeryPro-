'use client';

import { getReadinessDisplay, launchControlLabel } from "@/lib/integration/launchReadiness";

type Check={check_key:string;status:"pass"|"warn"|"fail"|"pending";detail:string};

function Badge({status,label}:{status:Check["status"];label?:string}){
  const expectedControl=label==="DISABLED"||label==="INCOMPLETE";
  const cls=expectedControl?"badge gold":status==="pass"?"badge green":status==="fail"?"badge red":"badge gold";
  return <span className={cls}>{label??status.toUpperCase()}</span>;
}

export default function LaunchValidationPanel({
  envChecks,dbChecks,release,demo
}:{envChecks:Check[];dbChecks:Check[];release:any;demo:boolean}){
  const all=[...envChecks,...dbChecks];
  const fails=all.filter(c=>c.status==="fail").length;
  const warns=all.filter(c=>c.status==="warn"||c.status==="pending").length;
  const gate=!demo&&fails===0&&warns===0;
  const readiness=getReadinessDisplay({...release,database_checks:dbChecks});
  const locked=readiness.launchLabel==="LOCKED"&&!envChecks.some(c=>c.status==="fail");

  return <>
    <div className="pagehead">
      <div><h1>Production Validation</h1><p>Environment, database integrity and launch-gate checks for the complete DS Bakery master system.</p></div>
      <span className={gate?"badge green":locked?"badge gold":fails?"badge red":"badge gold"}>{gate?"READY CHECKS PASS":locked?"PRODUCTION LOCKED":fails?"BLOCKED":"VALIDATION PENDING"}</span>
    </div>

    <div className="hero">
      <h2>Release v{release?.app_version??"0.30.0"} • Migration {String(release?.latest_migration??29).padStart(3,"0")}</h2>
      <p>Feature integration is complete enough for formal validation. This page deliberately separates <b>source completeness</b> from <b>real deployment proof</b>.</p>
    </div>

    <div className="grid4">
      <div className="card stat"><div className="label">Environment Checks</div><div className="value">{envChecks.length}</div></div>
      <div className="card stat"><div className="label">Database Checks</div><div className="value">{readiness.integrityChecks.length}</div></div>
      <div className="card stat"><div className="label">Blocking Checks</div><div className="value">{fails}</div></div>
      <div className="card stat"><div className="label">Warnings / Pending</div><div className="value">{warns}</div></div>
    </div>

    <div className="grid2" style={{marginTop:16}}>
      <div className="card">
        <h3 style={{color:"var(--brown)",marginTop:0}}>Environment</h3>
        {envChecks.map(c=><div key={c.check_key} style={{padding:"10px 0",borderBottom:"1px solid #f0e6da"}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:12}}><b>{c.check_key.replaceAll("_"," ")}</b><Badge status={c.status}/></div>
          <p style={{color:"var(--muted)",fontSize:12,lineHeight:1.5,margin:"5px 0 0"}}>{c.detail}</p>
        </div>)}
      </div>
      <div className="card">
        <h3 style={{color:"var(--brown)",marginTop:0}}>Database Integrity</h3>
        {readiness.integrityChecks.map(c=><div key={c.check_key} style={{padding:"10px 0",borderBottom:"1px solid #f0e6da"}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:12}}><b>{c.check_key.replaceAll("_"," ")}</b><Badge status={c.status}/></div>
          <p style={{color:"var(--muted)",fontSize:12,lineHeight:1.5,margin:"5px 0 0"}}>{c.detail}</p>
        </div>)}
      </div>
    </div>

    <div className="card" style={{marginTop:16}}>
      <h3 style={{color:"var(--brown)",marginTop:0}}>Production Launch Controls</h3>
      <p style={{color:"var(--muted)",fontSize:12,lineHeight:1.5}}>{readiness.detail}</p>
      {readiness.launchControls.map(c=><div key={c.check_key} style={{padding:"10px 0",borderBottom:"1px solid #f0e6da"}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:12}}><b>{c.check_key.replaceAll("_"," ")}</b><Badge status={c.status} label={launchControlLabel(c,release)}/></div>
        <p style={{color:"var(--muted)",fontSize:12,lineHeight:1.5,margin:"5px 0 0"}}>{c.detail}</p>
      </div>)}
    </div>

    <div className="card" style={{marginTop:16}}>
      <h3 style={{color:"var(--brown)",marginTop:0}}>Manual Launch Gates</h3>
      <div className="grid2">
        <div>
          <p>□ Clean database migration 002–021 passes</p>
          <p>□ Upgrade migration from v0.21 passes</p>
          <p>□ Owner / Manager / Cashier / Baker / Storekeeper acceptance tests pass</p>
          <p>□ Full production build passes</p>
        </div>
        <div>
          <p>□ Complete bakery workday E2E passes</p>
          <p>□ Backup schedule is active</p>
          <p>□ Restore to non-production succeeds</p>
          <p>□ Production domain + HTTPS + secrets configured</p>
        </div>
      </div>
    </div>

    <div className="hero" style={{marginTop:16}}>
      <h2>Launch rule</h2>
      <p>Do not move real sales, customer payments or stock into this system until all database failures are zero and the manual launch gates have been signed off.</p>
    </div>
  </>;
}
