import Sidebar from "@/components/Sidebar";
import { getSystemHealth } from "@/lib/integration/health";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const modules = [
  ["Products / Recipes / Costing","Ready"],
  ["Stock / Purchasing","Ready"],
  ["Cashier POS","Ready"],
  ["Expenses / Cash / Daily Closing","Ready"],
  ["Dashboard / Financial Reports","Ready"],
  ["Security / Audit / Backup procedures","Ready"],
  ["Production / Baker Tasks","Ready"],
  ["Waste / Production Control","Ready"],
  ["Suppliers / Payables / Purchase Orders","Ready"],
  ["Customers / Orders / Deposits","Ready"],
  ["Operational Reports","Ready"],
  ["Custom Cakes","Ready"],
  ["Deliveries / Riders","Ready"],
  ["Loyalty / Birthdays","Ready"],
  ["WhatsApp click-to-chat","Ready"],
  ["Attendance / Schedules / Permissions","Ready"],
];

export default async function SystemStatus() {
  await requireStaff(["owner"]);
  const health = await getSystemHealth();
  const supabase=await createClient();
  const [launchResult,deploymentResult]=await Promise.all([
    supabase.rpc("launch_readiness_summary"),
    supabase.rpc("deployment_readiness_summary"),
  ]);
  const launch:any=launchResult.data??{};
  const deployment:any=deploymentResult.data??{};
  const version=String(launch.app_version??"0.35.0");
  const migration=Number(launch.latest_migration??34);
  const placeholders=Number(launch?.placeholders?.total_placeholder_records??0);

  return <div className="shell"><Sidebar/><main className="main">
    <div className="pagehead">
      <div>
        <h1>Integration & Go-Live Status</h1>
        <p>Current staging evidence for the single DS Bakery master system.</p>
      </div>
      <span className={health.mode==="live"?"badge green":"badge gold"}>{health.environment.toUpperCase()}</span>
    </div>

    <div className="hero">
      <h2>DS Bakery Master v{version} — Migration {String(migration).padStart(3,"0")}</h2>
      <p>The staging application is deployed on Railway and connected to Supabase. Production remains intentionally gated until real business data, backup/restore proof and final production cutover checks are completed.</p>
    </div>

    <div className="grid2">
      <div className="card">
        <h3 style={{color:"var(--brown)",marginTop:0}}>Runtime Health</h3>
        {health.checks.map(c=><div key={c.key} style={{padding:"11px 0",borderBottom:"1px solid #f0e6da"}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:12}}>
            <b>{c.label}</b>
            <span className={c.status==="pass"?"badge green":c.status==="warn"?"badge gold":"badge red"}>{c.status.toUpperCase()}</span>
          </div>
          <p style={{margin:"5px 0 0",fontSize:12,color:"var(--muted)",lineHeight:1.5}}>{c.detail}</p>
        </div>)}
      </div>

      <div className="card">
        <h3 style={{color:"var(--brown)",marginTop:0}}>Deployment Evidence</h3>
        <p>{deployment.source_prepared?"✓":"○"} Deployment source prepared</p>
        <p>{deployment.runtime_env_prepared?"✓":"○"} Railway staging environment configured</p>
        <p>{deployment.build_verified?"✓":"○"} Production build verified</p>
        <p>{deployment.healthcheck_verified?"✓":"○"} HTTPS health check verified</p>
        <p>{deployment.auth_login_verified?"✓":"○"} Owner browser login verified</p>
        <p>{deployment.public_site_verified?"✓":"○"} Final public-site visual verification</p>
      </div>
    </div>

    <div className="grid2" style={{marginTop:16}}>
      <div className="card">
        <h3 style={{color:"var(--brown)",marginTop:0}}>Database Readiness</h3>
        <p>Database gate: <b>{String(launch.database_gate??"pending").toUpperCase()}</b></p>
        <p>Validation failures: <b>{Number(launch.fail_count??0)}</b></p>
        <p>Validation warnings: <b>{Number(launch.warn_count??0)}</b></p>
        <p>Staging placeholders: <b>{placeholders}</b></p>
      </div>
      <div className="card">
        <h3 style={{color:"var(--brown)",marginTop:0}}>Production Gates Still Open</h3>
        <p>○ Replace staging placeholders with real bakery data</p>
        <p>○ Verify real opening stock, catalog and final staff details</p>
        <p>○ Complete real backup/restore drill</p>
        <p>○ Complete final public-site visual review</p>
        <p>○ Execute controlled production cutover</p>
      </div>
    </div>

    <div className="card" style={{marginTop:16}}>
      <h3 style={{color:"var(--brown)",marginTop:0}}>Master Modules</h3>
      <div className="tablewrap"><table><thead><tr><th>Module</th><th>Feature Build</th><th>Live Data Requirement</th></tr></thead>
      <tbody>{modules.map((m,i)=><tr key={i}>
        <td><b>{m[0]}</b></td>
        <td><span className="badge green">{m[1]}</span></td>
        <td>{health.mode==="live"?<span className="badge green">Supabase available</span>:<span className="badge gold">Demo / sample data may remain</span>}</td>
      </tr>)}</tbody></table></div>
    </div>
  </main></div>
}
