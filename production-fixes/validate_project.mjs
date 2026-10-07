import fs from "node:fs";
import path from "node:path";

const cwd=process.cwd();
let failed=false;
const warnings=[];

function pass(label,detail=""){ console.log(`PASS  ${label}${detail?` — ${detail}`:""}`); }
function fail(label,detail=""){ failed=true; console.error(`FAIL  ${label}${detail?` — ${detail}`:""}`); }
function warn(label,detail=""){ warnings.push(label); console.warn(`WARN  ${label}${detail?` — ${detail}`:""}`); }
function exists(rel){ return fs.existsSync(path.join(cwd,rel)); }
function read(rel){ return fs.readFileSync(path.join(cwd,rel),"utf8"); }

console.log("\nDS Bakery v0.38 Project Validation\n");

const pkg=JSON.parse(read("package.json"));
pkg.version==="0.38.0"?pass("Package version","0.38.0"):fail("Package version",pkg.version);

for(const rel of [
  "supabase/021_production_validation.sql",
  "supabase/022_public_website_live.sql",
  "supabase/023_public_contact_details.sql",
  "supabase/024_staging_validation_harness.sql",
  "supabase/025_environment_guardrails.sql",
  "supabase/026_go_live_setup.sql",
  "supabase/027_production_cutover.sql",
  "supabase/028_supabase_staging_handoff.sql",
  "supabase/029_security_hardening.sql",
  "supabase/030_real_workflow_hardening.sql",
  "supabase/031_formal_staging_validation.sql",
  "supabase/032_placeholder_guard_payment_validation.sql",
  "supabase/033_backup_recovery_readiness.sql",
  "supabase/034_deployment_preparation.sql",
  "supabase/035_staging_hardening_consolidation.sql",
  "supabase/036_usability_data_management_core_business.sql",
  "app/opening-balances/page.tsx",
  "components/validation/OpeningBalancesManager.tsx",
  "app/my-account/page.tsx",
  "app/recycle-bin/page.tsx",
  "app/credit-book/page.tsx",
  "app/payroll/page.tsx",
  "app/finished-goods/page.tsx",
  "components/public/PublicShop.tsx",
  "app/validation/page.tsx",
  "app/public-site-settings/page.tsx",
  "app/validation-history/page.tsx",
  "app/environment/page.tsx",
  "app/go-live-setup/page.tsx",
  "app/production-cutover/page.tsx",
  "app/staging-connection/page.tsx",
  "scripts/staging_connection_check.mjs",
  "scripts/staging_upgrade_to_v029.sh",
  "scripts/staging_upgrade_to_v028.sh",
  "scripts/staging_upgrade_to_v027.sh",
  "scripts/staging_go_live_readiness.mjs",
  "scripts/staging_preflight.mjs",
  "scripts/staging_apply_schema.sh",
  "scripts/staging_upgrade_to_v026.sh",
  ".env.staging.example",
  "scripts/staging_create_test_users.mjs",
  "scripts/staging_validate.mjs",
  "lib/repositories/validationLive.ts",
  "docs/DEPLOYMENT_RUNBOOK.md",
  "docs/ROLE_RLS_ACCEPTANCE_MATRIX.md",
  "docs/GO_LIVE_SIGNOFF.md",
  ".env.production.example",
]){
  exists(rel)?pass(`Required release file: ${rel}`):fail(`Required release file: ${rel}`);
}

const migrationFiles=fs.readdirSync(path.join(cwd,"supabase"))
  .filter(f=>/^\d{3}_.*\.sql$/.test(f)).sort();
const nums=migrationFiles.map(f=>Number(f.slice(0,3)));
const missing=[];
for(let n=2;n<=36;n++) if(!nums.includes(n)) missing.push(n);
missing.length===0
  ?pass("Migration sequence","002–036 complete")
  :fail("Migration sequence",`Missing ${missing.join(", ")}`);

const schema=read("supabase/schema.sql");
schema.includes("app_version='0.37.0'") && schema.includes("latest_migration=36")
  ?pass("Base schema includes migration 036")
  :fail("Base schema includes migration 036");

const appPages=[];
function walk(dir){
  for(const name of fs.readdirSync(dir)){
    const p=path.join(dir,name);
    const st=fs.statSync(p);
    if(st.isDirectory())walk(p);
    else if(name==="page.tsx")appPages.push(p);
  }
}
walk(path.join(cwd,"app"));

const publicPages=new Set([
  path.join(cwd,"app","page.tsx"),
  path.join(cwd,"app","login","page.tsx"),
  path.join(cwd,"app","reset-password","page.tsx"),
]);
const redirectOnly=new Set([
  path.join(cwd,"app","operational-reports","page.tsx"),
]);

for(const p of appPages){
  if(publicPages.has(p)||redirectOnly.has(p))continue;
  const body=fs.readFileSync(p,"utf8");
  const guarded=body.includes("requireStaff(")||body.includes("requirePermission(");
  guarded
    ?pass(`Route guard: ${path.relative(cwd,p)}`)
    :fail(`Route guard: ${path.relative(cwd,p)}`,"No explicit role/permission guard found");
}


const sidebar=read("components/Sidebar.tsx");
sidebar.includes('roles:["owner"]') && sidebar.includes('System & Setup')
  ?pass("Role-aware business sidebar")
  :fail("Role-aware business sidebar");

const dashboard=read("app/dashboard/page.tsx");
dashboard.includes("Quick Actions") && dashboard.includes("Today\'s Sales")
  ?pass("Practical Owner dashboard")
  :fail("Practical Owner dashboard");

const v37Checks=[
  ["Logout control",read("components/Sidebar.tsx").includes("supabase.auth.signOut()")],
  ["Recycle Bin UI",exists("app/recycle-bin/page.tsx")&&read("components/admin/RecycleBinManager.tsx").includes("restore_recycled_record")],
  ["Product editing",read("components/core/ProductManager.tsx").includes("Edit")],
  ["Raw-material editing",read("components/core/InventoryManager.tsx").includes("save_raw_material")],
  ["Credit Book",exists("app/credit-book/page.tsx")&&read("components/finance/CreditBookManager.tsx").includes("record_credit_payment")],
  ["Payroll",exists("app/payroll/page.tsx")&&read("components/finance/PayrollManager.tsx").includes("generate_payroll_run")],
  ["Finished-goods batch costing",exists("app/finished-goods/page.tsx")&&schema.includes("finished_goods_batches")&&schema.includes("sale_batch_allocations")],
  ["Public online checkout",read("components/public/PublicShop.tsx").includes("submit_public_order")],
];
for(const [label,ok] of v37Checks) ok?pass(label):fail(label);

const packageJson=JSON.parse(read("package.json"));
packageJson.overrides?.postcss==="8.5.28"
  ?pass("PostCSS security override","8.5.28")
  :fail("PostCSS security override");

const clientFiles=[];
for(const base of ["components","app"]){
  const dir=path.join(cwd,base);
  const stack=[dir];
  while(stack.length){
    const cur=stack.pop();
    for(const name of fs.readdirSync(cur)){
      const p=path.join(cur,name);
      const st=fs.statSync(p);
      if(st.isDirectory())stack.push(p);
      else if(/\.(ts|tsx)$/.test(name)) clientFiles.push(p);
    }
  }
}

for(const p of clientFiles){
  const body=fs.readFileSync(p,"utf8");
  if(body.includes('"use client"')||body.includes("'use client'")){
    if(/process\.env\.(SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL)/.test(body)
       || body.includes("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY")
       || body.includes("NEXT_PUBLIC_DATABASE_URL")){
      fail(`Server secret leakage: ${path.relative(cwd,p)}`,"Client component references a server-only secret value");
    }
    const directWrite=/\.from\([^)]*\)\s*\.(insert|update|delete|upsert)\s*\(/s.test(body);
    if(directWrite){
      fail(`Direct client table write: ${path.relative(cwd,p)}`,"Use an audited RPC instead");
    }
  }
}
pass("Client secret/direct-write scan");

const invite=read("app/api/staff/invite/route.ts");
const createStaff=read("app/api/staff/create/route.ts");
for(const [label,source,endpoint] of [["Invite staff",invite,"/functions/v1/invite-staff"],["Create staff",createStaff,"/functions/v1/create-staff-account"]]){
  const delegates=source.includes(endpoint)&&source.includes('authHeader.startsWith("Bearer ")')&&source.includes('"authorization":authHeader')&&source.includes('"apikey":publicKey');
  delegates&&!source.includes("SUPABASE_SERVICE_ROLE_KEY")
    ?pass(`${label} delegates to the authenticated Edge Function`)
    :fail(`${label} authentication boundary`,"Expected bearer forwarding, public API key and no service-role key in the web app");
}

const middleware=read("middleware.ts");
middleware.includes('"/login"') && middleware.includes('"/api/health"')
  ?pass("Middleware public-route allowlist")
  :warn("Middleware public-route allowlist","Review public paths before deployment");

const envExample=read(".env.production.example");
envExample.includes("NEXT_PUBLIC_DEMO_MODE=false")
  ?pass("Production env disables demo mode")
  :fail("Production env disables demo mode");
envExample.includes("SUPABASE_SERVICE_ROLE_KEY=")&&!envExample.includes("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY")
  ?pass("Production env keeps service role private")
  :fail("Production env service-role naming");

const schemaDefiner=(schema.match(/security definer/gi)||[]).length;
const searchPaths=(schema.match(/set search_path\s*=\s*public/gi)||[]).length;
searchPaths>=schemaDefiner*0.8
  ?pass("SECURITY DEFINER search_path coverage",`${searchPaths}/${schemaDefiner} public search_path markers`)
  :warn("SECURITY DEFINER search_path coverage",`${searchPaths}/${schemaDefiner}; manually review exceptions`);

console.log(`\nWarnings: ${warnings.length}`);
if(failed){
  console.error("Project validation FAILED.");
  process.exit(1);
}
console.log("Project validation PASSED.");
