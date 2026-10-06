import { createClient } from "@supabase/supabase-js";

const url=process.env.STAGING_SUPABASE_URL;
const anonKey=process.env.STAGING_SUPABASE_ANON_KEY;
const serviceKey=process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
const domain=process.env.STAGING_TEST_EMAIL_DOMAIN;
const ownerEmail=process.env.STAGING_OWNER_EMAIL || (domain ? `ds-owner-test@${domain}` : null);
const password=process.env.STAGING_OWNER_PASSWORD || process.env.STAGING_TEST_PASSWORD;

if(!url||!anonKey||!serviceKey){
  throw new Error("Set STAGING_SUPABASE_URL, STAGING_SUPABASE_ANON_KEY and STAGING_SUPABASE_SERVICE_ROLE_KEY.");
}

let host="unknown";
try{ host=new URL(url).host; }catch{ throw new Error("STAGING_SUPABASE_URL is not a valid URL."); }

console.log(`Checking Supabase staging project: ${host}`);

const anon=createClient(url,anonKey,{auth:{autoRefreshToken:false,persistSession:false}});
const admin=createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});

const checks=[];
function add(check,status,detail){
  checks.push({check,status,detail});
  console.log(`${status.toUpperCase().padEnd(5)} ${check} — ${detail}`);
}

const {data:release,error:releaseError}=await admin
  .from("system_release_state")
  .select("app_version,latest_migration,release_stage")
  .eq("id",1)
  .single();

if(releaseError){
  add("release_state","fail",releaseError.message);
}else if(release.app_version!=="0.38.0"||Number(release.latest_migration)!==38){
  add("release_state","fail",`Database reports v${release.app_version} / migration ${release.latest_migration}; expected v0.38.0 / 038.`);
}else{
  add("release_state","pass",`v${release.app_version} / migration ${release.latest_migration}`);
}

const {data:env,error:envError}=await admin
  .from("system_environment_config")
  .select("environment_mode,allow_staging_test_accounts,production_lock")
  .eq("id",1)
  .single();

if(envError){
  add("environment_guardrail","fail",envError.message);
}else if(env.environment_mode!=="staging"){
  add("environment_guardrail","fail",`Database mode is ${env.environment_mode}; Staging is required.`);
}else if(env.production_lock){
  add("environment_guardrail","fail","Production Lock is enabled.");
}else{
  add(
    "environment_guardrail",
    env.allow_staging_test_accounts?"pass":"warn",
    `Mode=staging, test accounts=${env.allow_staging_test_accounts?"enabled":"disabled"}, production lock=off`
  );
}

const {data:siteInfo,error:siteError}=await anon.rpc("public_site_info");
if(siteError){
  add("anonymous_public_site","fail",siteError.message);
}else{
  const contactOkay=
    siteInfo?.address_text==="Kiwafu Lugonjo"
    && siteInfo?.phone==="0708743663"
    && siteInfo?.secondary_phone==="0760547003"
    && siteInfo?.whatsapp_phone==="0760547003"
    && siteInfo?.email==="dscakes3@gmail.com";
  add("anonymous_public_site",contactOkay?"pass":"warn",contactOkay?"Public website RPC and DS Bakery contact defaults are available.":"Public RPC works, but one or more release contact defaults differ.");
}

const {data:catalog,error:catalogError}=await anon.rpc("public_product_catalog");
if(catalogError){
  add("anonymous_product_catalog","fail",catalogError.message);
}else{
  const forbidden=["current_stock_qty","cost","gross_profit","margin","recipe","supplier_id","created_by"];
  const leaked=(catalog??[]).flatMap(row=>forbidden.filter(k=>Object.prototype.hasOwnProperty.call(row,k)));
  add(
    "anonymous_product_catalog",
    leaked.length?"fail":"pass",
    leaked.length?`Unexpected internal keys: ${[...new Set(leaked)].join(", ")}`:`Catalog RPC returned ${(catalog??[]).length} row(s) without known internal fields.`
  );
}

const {data:userList,error:userListError}=await admin.auth.admin.listUsers({page:1,perPage:1});
if(userListError){
  add("service_role_admin","fail",userListError.message);
}else{
  add("service_role_admin","pass","Server service-role credential can access the staging Auth admin API.");
}

const failures=checks.filter(c=>c.status==="fail");
const warnings=checks.filter(c=>c.status==="warn");

if(ownerEmail&&password&&!failures.length){
  const owner=createClient(url,anonKey,{auth:{autoRefreshToken:false,persistSession:false}});
  const email=ownerEmail.trim().toLowerCase();
  const {error:loginError}=await owner.auth.signInWithPassword({email,password});

  if(loginError){
    add("connection_evidence_record","warn",`Owner test login unavailable, so evidence was not recorded: ${loginError.message}`);
  }else{
    const evidence={
      project_host:host,
      release:release??null,
      environment:env??null,
      public_catalog_rows:(catalog??[]).length,
      check_count:checks.length,
    };
    const status=warnings.length?"warn":"pass";
    const {data:id,error}=await owner.rpc("record_environment_connection_check",{
      p_check_type:"supabase_connectivity",
      p_status:status,
      p_detail:status==="pass"
        ?"Supabase staging connectivity, release state, anonymous public RPCs and service-role admin access passed."
        :"Supabase staging connection passed with warnings.",
      p_metadata:evidence,
    });
    if(error){
      add("connection_evidence_record","warn",error.message);
    }else{
      add("connection_evidence_record","pass",`Recorded staging connection evidence ${id}.`);
    }
  }
}else if(!ownerEmail||!password){
  add("connection_evidence_record","warn","Configure the existing Owner's STAGING_OWNER_EMAIL and STAGING_OWNER_PASSWORD privately to record Owner-authenticated evidence.");
}

const finalFailures=checks.filter(c=>c.status==="fail").length;
const finalWarnings=checks.filter(c=>c.status==="warn").length;

console.log(`\nConnection result: ${finalFailures} fail(s), ${finalWarnings} warning(s), ${checks.length} checks.`);
if(finalFailures)process.exit(1);
