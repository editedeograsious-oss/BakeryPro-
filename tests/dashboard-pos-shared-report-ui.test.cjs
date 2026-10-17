const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const get=name=>fs.readFileSync(path.join(__dirname,"..","production-fixes",name),"utf8");

test("Owner dashboard confirms totals with live shared reporting RPC",()=>{
 const text=get("dashboard-page.tsx");
 assert(text.includes('supabase.rpc("owner_dashboard_summary",{p_period:"day"})'));
 assert(text.includes("Sales report unavailable."));
 assert(text.includes("Latest saved POS sale"));
 assert(text.includes('timeZone:"Africa/Kampala"'));
});
test("POS verifies active shift for signed-in cashier",()=>{
 const page=get("pos-page.tsx");
 assert(page.includes('from("cashier_shifts")'));
 assert(page.includes('.eq("cashier_id",staff.user!.id)'));
 assert(page.includes('.eq("status","open")'));
});
test("POS error shown near posting action",()=>{
 const body=get("PosTerminal.tsx");
 const a=body.indexOf('Complete and Save Sale');
 const b=body.indexOf('role={message.startsWith("SALE NOT SAVED")?"alert":"status"}');
 assert(a!==-1&&b>a);
 assert(body.includes("This transaction has NOT reached the shared sales database."));
});
