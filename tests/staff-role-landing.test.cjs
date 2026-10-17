const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const ts=require("typescript");
const root=path.resolve(__dirname,"../production-fixes");
function runFile(name,mocks={}){
  const src=fs.readFileSync(path.join(root,name),"utf8");
  const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
  const module={exports:{}};
  vm.runInNewContext(js,{module,exports:module.exports,console,process,
    require:(key)=>Object.hasOwn(mocks,key)?mocks[key]:require(key)}, {filename:name});
  return module.exports;
}
async function main(){
 const {staffHomePath}=runFile("staffHome.ts");
 assert.equal(staffHomePath("owner"),"/dashboard");
 assert.equal(staffHomePath("manager"),"/dashboard");
 assert.equal(staffHomePath("cashier"),"/pos");
 assert.equal(staffHomePath("baker"),"/production");
 assert.equal(staffHomePath("storekeeper"),"/inventory");
 assert.equal(staffHomePath("unknown"),"/access-denied?reason=role");

 let role="cashier",guardCalls=0;
 const redirect=(url)=>{const error=new Error("NEXT_REDIRECT:"+url);error.url=url;throw error;};
 const page=runFile("dashboard-page.tsx",{
   "next/navigation":{redirect},
   "@/lib/auth":{getCurrentStaff:async()=>({profile:{role}})},
   "@/lib/staffHome":{staffHomePath},
   "@/lib/access":{requirePermission:async()=>{guardCalls++;throw new Error("REACHED_DASHBOARD_PERMISSION_CHECK");}},
   "next/link":{default:()=>null},
   "@/components/Sidebar":{default:()=>null},
   "@/lib/runtime":{deploymentEnvironment:()=>"staging",runtimeMode:()=>"live"},
   "@/lib/repositories/reports":{getOwnerDashboard:async()=>({})},
   "@/lib/supabase/server":{createClient:async()=>({})},
   "@/lib/costing":{ugx:()=>""},
   "@/lib/integration/launchReadiness":{getReadinessDisplay:()=>({})}
 }).default;
 for(const [staffRole,url] of [["cashier","/pos"],["baker","/production"],["storekeeper","/inventory"]]){
   role=staffRole;
   await assert.rejects(page,e=>e.url===url,staffRole+" redirected to "+url);
 }
 assert.equal(guardCalls,0,"Non-management staff must not evaluate Owner Dashboard reports");
 for(const staffRole of ["owner","manager"]){
   role=staffRole;
   await assert.rejects(page,/REACHED_DASHBOARD_PERMISSION_CHECK/);
 }
 assert.equal(guardCalls,2,"Owner and manager retain server permission enforcement");
 const login=fs.readFileSync(path.join(root,"login-page.tsx"),"utf8");
 assert(login.includes("staffHomePath(staffProfile.role)"),"Login must use real staff role for landing");
 const recovery=fs.readFileSync(path.join(root,"staging-access-denied-page.tsx"),"utf8");
 assert(recovery.includes('href="/my-account"'),"Access denied page should offer a valid staff menu recovery");
 console.log("PASS: role-aware staff login routing and Owner Dashboard permission guard.");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
