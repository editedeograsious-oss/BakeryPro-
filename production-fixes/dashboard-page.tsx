import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { deploymentEnvironment, runtimeMode } from "@/lib/runtime";
import { requirePermission } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { getOwnerDashboard } from "@/lib/repositories/reports";
import { ugx } from "@/lib/costing";
import { getReadinessDisplay } from "@/lib/integration/launchReadiness";

export const dynamic = "force-dynamic";

const quickActions = [
  {href:"/pos", title:"New Sale", note:"Open the cashier POS and record a sale."},
  {href:"/products", title:"Products & Prices", note:"Manage products, prices and product setup."},
  {href:"/inventory", title:"Inventory", note:"Check raw-material stock and low-stock items."},
  {href:"/production", title:"Daily Bake Plan", note:"Plan and confirm today's production."},
  {href:"/purchase-orders", title:"Purchase Orders", note:"Order and receive ingredients from suppliers."},
  {href:"/expenses", title:"Record Expense", note:"Enter today's business expenses."},
  {href:"/daily-closing", title:"Daily Closing", note:"Review and close the bakery workday."},
  {href:"/staff", title:"Staff & Roles", note:"Manage staff accounts, roles and status."},
  {href:"/public-site-settings", title:"Website Settings", note:"Update public bakery contact and website details."},
  {href:"/reports", title:"Financial Reports", note:"Review sales, profit, expenses and trends."},
  {href:"/finished-goods", title:"Finished Goods & Batches", note:"Review batch stock, actual batch cost and realized profit."},
  {href:"/credit-book", title:"Customer Credit Book", note:"Manage approved credit, repayments and overdue balances."},
  {href:"/payroll", title:"Staff Salaries & Payroll", note:"Prepare salary runs, advances and salary payments."},
  {href:"/recycle-bin", title:"Recycle Bin", note:"Restore safely deleted records and review deletion history."},
  {href:"/custom-cakes", title:"Custom Cakes", note:"Manage custom cake requests and orders."},
  {href:"/activity-log", title:"Activity Log", note:"See recent sensitive actions in the system."},
];

function num(v:any){ return Number(v ?? 0); }

function timeLabel(value:any){
  if(!value) return "—";
  try {
    return new Intl.DateTimeFormat("en-UG",{
      timeZone:"Africa/Kampala",
      month:"short",
      day:"2-digit",
      hour:"2-digit",
      minute:"2-digit",
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

export default async function Dashboard(){
  await requirePermission("dashboard:view");

  const mode=runtimeMode();
  const env=deploymentEnvironment();
  const supabase=await createClient();

  let dashboard:any={summary:[],bestSellers:[],lowStock:[],recentActivity:[],trend:[]};
  let alerts:any[]=[];

  try {
    dashboard=await getOwnerDashboard("day");
  } catch {
    // Keep the dashboard usable even if an optional reporting query is temporarily unavailable.
  }

  try {
    const {data}=await supabase.rpc("management_alerts");
    alerts=Array.isArray(data)?data:[];
  } catch {
    alerts=[];
  }

  const [launchResult,deploymentResult]=await Promise.all([
    supabase.rpc("launch_readiness_summary"),
    supabase.rpc("deployment_readiness_summary"),
  ]);

  const launch:any=launchResult.data??{};
  const readiness=getReadinessDisplay(launch,Boolean(launchResult.error));
  const deployment:any=deploymentResult.data??{};
  const today:any=Array.isArray(dashboard.summary)?(dashboard.summary[0]??{}):(dashboard.summary??{});
  const version=String(launch.app_version??"0.38.0");
  const migration=Number(launch.latest_migration??38);
  const buildVerified=deployment.build_verified===true;
  const healthVerified=deployment.healthcheck_verified===true;
  const loginVerified=deployment.auth_login_verified===true;
  const stagingOperational=buildVerified&&healthVerified&&loginVerified;
  const runtimeLabel=env==="staging"?"STAGING":mode==="live"?"LIVE":"DEMO";

  return <div className="shell"><Sidebar/><main className="main">
    <div className="pagehead">
      <div>
        <h1>Owner Dashboard</h1>
        <p>Your daily control centre for sales, stock, production, staff and the public website.</p>
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <Link className="btn primary" href="/pos">+ New Sale</Link>
        <Link className="btn" href="/reports">View Reports</Link>
      </div>
    </div>

    <div className="hero">
      <h2>Today's Business at a Glance</h2>
      <p>Live figures from the shared DS Bakery database. All money values are in Uganda shillings.</p>
    </div>

    <div className="grid4">
      <div className="card stat"><div className="label">Today's Sales</div><div className="value" style={{fontSize:24}}>{ugx(num(today.sales))}</div><div style={{marginTop:6,color:"var(--muted)",fontSize:12}}>{num(today.transaction_count)} transaction(s)</div></div>
      <div className="card stat"><div className="label">Gross Profit</div><div className="value" style={{fontSize:24}}>{ugx(num(today.gross_profit))}</div><div style={{marginTop:6,color:"var(--muted)",fontSize:12}}>Before expenses</div></div>
      <div className="card stat"><div className="label">Today's Expenses</div><div className="value" style={{fontSize:24}}>{ugx(num(today.expenses))}</div><div style={{marginTop:6}}><Link href="/expenses" style={{fontSize:12}}>Record expense →</Link></div></div>
      <div className="card stat"><div className="label">Operating Profit</div><div className="value" style={{fontSize:24}}>{ugx(num(today.estimated_operating_profit))}</div><div style={{marginTop:6,color:"var(--muted)",fontSize:12}}>Estimated after recorded expenses</div></div>
    </div>

    <div className="card" style={{marginTop:16}}>
      <div><h3 style={{color:"var(--brown)",margin:"0 0 4px"}}>Quick Actions</h3><p style={{margin:0,color:"var(--muted)"}}>Go straight to the jobs the Owner uses most often.</p></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:12,marginTop:14}}>
        {quickActions.map(a=><Link key={a.href} href={a.href} className="card" style={{textDecoration:"none",padding:14,minHeight:96,display:"block"}}><div style={{fontWeight:800,color:"var(--brown)",fontSize:16}}>{a.title}</div><div style={{fontSize:12,lineHeight:1.45,color:"var(--muted)",marginTop:6}}>{a.note}</div></Link>)}
      </div>
    </div>

    <div className="grid2" style={{marginTop:16}}>
      <div className="card">
        <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}><h3 style={{color:"var(--brown)",margin:0}}>Payment Breakdown — Today</h3><span className="badge green">LIVE</span></div>
        <div style={{marginTop:14}}>
          <p style={{display:"flex",justifyContent:"space-between",gap:12}}><span>Cash</span><b>{ugx(num(today.cash_sales))}</b></p>
          <p style={{display:"flex",justifyContent:"space-between",gap:12}}><span>MTN MoMo</span><b>{ugx(num(today.mtn_momo_sales))}</b></p>
          <p style={{display:"flex",justifyContent:"space-between",gap:12}}><span>Airtel Money</span><b>{ugx(num(today.airtel_money_sales))}</b></p>
          <p style={{display:"flex",justifyContent:"space-between",gap:12,borderTop:"1px solid var(--line)",paddingTop:10}}><span>Average Sale</span><b>{ugx(num(today.average_sale))}</b></p>
        </div>
      </div>
      <div className="card">
        <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}><h3 style={{color:"var(--brown)",margin:0}}>Owner Attention</h3><Link href="/operational-reports" style={{fontSize:12}}>Operational reports →</Link></div>
        <div style={{marginTop:12}}>{alerts.length===0?<p style={{color:"var(--muted)"}}>No management alerts right now.</p>:alerts.slice(0,6).map((a:any,i:number)=><div key={i} style={{padding:"10px 0",borderBottom:"1px solid var(--line)"}}><div style={{display:"flex",justifyContent:"space-between",gap:8}}><b>{a.title}</b><span className={a.severity==="high"?"badge red":"badge gold"}>{String(a.severity??"info").toUpperCase()}</span></div><div style={{fontSize:12,color:"var(--muted)",marginTop:4}}>{a.detail}</div></div>)}</div>
      </div>
    </div>

    <div className="grid2" style={{marginTop:16}}>
      <div className="card">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}><h3 style={{color:"var(--brown)",margin:0}}>Low Stock</h3><Link href="/inventory" style={{fontSize:12}}>Manage inventory →</Link></div>
        <div style={{marginTop:12}}>{dashboard.lowStock.length===0?<p style={{color:"var(--muted)"}}>No low-stock materials.</p>:dashboard.lowStock.slice(0,6).map((r:any)=><div key={r.id} style={{display:"flex",justifyContent:"space-between",gap:12,padding:"9px 0",borderBottom:"1px solid var(--line)"}}><span><b>{r.name}</b><br/><small style={{color:"var(--muted)"}}>Threshold {num(r.low_stock_threshold)} {r.base_unit}</small></span><b>{num(r.current_stock_qty)} {r.base_unit}</b></div>)}</div>
      </div>
      <div className="card">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}><h3 style={{color:"var(--brown)",margin:0}}>Best Sellers — 30 Days</h3><Link href="/products" style={{fontSize:12}}>Manage products →</Link></div>
        <div style={{marginTop:12}}>{dashboard.bestSellers.length===0?<p style={{color:"var(--muted)"}}>No sales data yet.</p>:dashboard.bestSellers.slice(0,5).map((r:any)=><div key={r.product_id} style={{display:"flex",justifyContent:"space-between",gap:12,padding:"9px 0",borderBottom:"1px solid var(--line)"}}><span><b>{r.product_name}</b><br/><small style={{color:"var(--muted)"}}>{num(r.units_sold)} unit(s)</small></span><b>{ugx(num(r.sales_amount))}</b></div>)}</div>
      </div>
    </div>

    <div className="grid2" style={{marginTop:16}}>
      <div className="card">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}><h3 style={{color:"var(--brown)",margin:0}}>Recent Activity</h3><Link href="/activity-log" style={{fontSize:12}}>Full log →</Link></div>
        <div style={{marginTop:12}}>{dashboard.recentActivity.length===0?<p style={{color:"var(--muted)"}}>No recent activity.</p>:dashboard.recentActivity.slice(0,6).map((r:any)=><div key={r.id} style={{padding:"9px 0",borderBottom:"1px solid var(--line)"}}><div style={{display:"flex",justifyContent:"space-between",gap:12}}><b>{r.action}</b><small style={{color:"var(--muted)"}}>{timeLabel(r.created_at)}</small></div><div style={{fontSize:12,color:"var(--muted)",marginTop:3}}>{r.entity}{r.entity_id?(" • "+String(r.entity_id).slice(0,8)):""}</div></div>)}</div>
      </div>
      <div className="card">
        <h3 style={{color:"var(--brown)",marginTop:0}}>System & Production Readiness</h3>
        <p style={{display:"flex",justifyContent:"space-between",gap:12}}><span>Runtime</span><b>{runtimeLabel}</b></p>
        <p style={{display:"flex",justifyContent:"space-between",gap:12}}><span>Master version</span><b>v{version}</b></p>
        <p style={{display:"flex",justifyContent:"space-between",gap:12}}><span>Latest migration</span><b>{String(migration).padStart(3,"0")}</b></p>
        <p style={{display:"flex",justifyContent:"space-between",gap:12}}><span>Database integrity</span><b>{readiness.integrityLabel}</b></p>
        <p style={{display:"flex",justifyContent:"space-between",gap:12}}><span>Production launch</span><b>{readiness.launchLabel}</b></p>
        <p style={{fontSize:12,color:"var(--muted)",lineHeight:1.5}}>{readiness.detail}</p>
        <p style={{display:"flex",justifyContent:"space-between",gap:12}}><span>Staging deployment</span><b>{stagingOperational?"VERIFIED":"IN REVIEW"}</b></p>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:14}}><Link className="btn" href="/system-status">System Status</Link><Link className="btn" href="/go-live-setup">Go-Live Setup</Link></div>
      </div>
    </div>
  </main></div>;
}
