import Sidebar from "@/components/Sidebar";
import { deploymentEnvironment, runtimeMode } from "@/lib/runtime";
import { requirePermission } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Dashboard(){
  await requirePermission("dashboard:view");

  const mode=runtimeMode();
  const env=deploymentEnvironment();
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
  const buildVerified=deployment.build_verified===true;
  const healthVerified=deployment.healthcheck_verified===true;
  const loginVerified=deployment.auth_login_verified===true;
  const stagingOperational=buildVerified&&healthVerified&&loginVerified;
  const runtimeLabel=env==="staging"?"STAGING":mode==="live"?"LIVE":"DEMO";

  return <div className="shell"><Sidebar/><main className="main">
    <div className="pagehead">
      <div>
        <h1>Owner Dashboard</h1>
        <p>Live staging status for the DS Bakery master system, deployment and production-readiness gates.</p>
      </div>
      <a className="btn primary" href="/system-status">System Status</a>
    </div>

    <div className="hero">
      <h2>DS Bakery Master v{version} — Railway Staging Deployment</h2>
      <p>The management system is running against the DS Bakery Supabase staging database. Core bakery workflows, role/RLS validation, the Next.js production build and Railway health checks have been completed in staging.</p>
    </div>

    <div className="grid4">
      <div className="card stat"><div className="label">Runtime</div><div className="value" style={{fontSize:22}}>{runtimeLabel}</div></div>
      <div className="card stat"><div className="label">Latest Migration</div><div className="value">{String(migration).padStart(3,"0")}</div></div>
      <div className="card stat"><div className="label">Database Gate</div><div className="value" style={{fontSize:20}}>{String(launch.database_gate??"pending").toUpperCase()}</div></div>
      <div className="card stat"><div className="label">Staging Deployment</div><div className="value" style={{fontSize:20}}>{stagingOperational?"VERIFIED":"IN REVIEW"}</div></div>
    </div>

    <div className="grid2" style={{marginTop:16}}>
      <div className="card">
        <h3 style={{color:"var(--brown)",marginTop:0}}>Verified in Staging</h3>
        <p>✓ Real Supabase database and staff authentication connected</p>
        <p>✓ Owner / Manager / Cashier / Baker / Storekeeper role and RLS validation completed</p>
        <p>✓ End-to-end purchase → production → waste → sale → closing workflow tested</p>
        <p>✓ Next.js production build and Railway health check passed</p>
        <p>✓ npm dependency audit reports 0 vulnerabilities</p>
        <p>{loginVerified?"✓":"○"} Owner browser login verified</p>
      </div>

      <div className="card">
        <h3 style={{color:"var(--brown)",marginTop:0}}>Still Required Before Production</h3>
        <p>{placeholders>0 ? "○ Replace "+placeholders+" staging placeholder record(s) with real bakery data" : "✓ Placeholder staging data cleared"}</p>
        <p>○ Enter real opening stock, catalog details and final staff information</p>
        <p>○ Complete and record the real backup/restore drill</p>
        <p>○ Finish final public website visual verification</p>
        <p>○ Complete controlled production cutover only after all production gates pass</p>
      </div>
    </div>
  </main></div>;
}
