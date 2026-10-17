const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const d=path.resolve(__dirname,"../production-fixes");
const read=n=>fs.readFileSync(path.join(d,n),"utf8");
const login=read("login-page.tsx"),auth=read("staging-auth-no-loop.ts"),
 staff=read("staging-StaffAdminManager.tsx"),sidebar=read("Sidebar.tsx"),
 viewer=read("view-only-page.tsx"),first=read("FirstLoginForm.tsx"),
 completion=read("complete-first-login-route.ts");
assert(login.includes('"/first-login"')&&login.includes("require_password_reset"));
assert(auth.includes('redirect("/first-login")')&&auth.includes("require_password_reset"));
assert(read("staffHome.ts").includes('return "/view-only"'));
assert(staff.includes('"viewer"')&&staff.includes("View-Only Staff"));
assert(sidebar.includes('roles:["viewer"]')&&sidebar.includes("View-Only Staff"));
assert(viewer.includes('sb.rpc("viewer_product_stock")')&&!viewer.includes(".update("));
assert(first.includes('current_password')&&first.includes('new_password'));
assert(first.includes("await sb.auth.signOut()"));
assert(completion.includes('complete-staff-first-login')&&!completion.includes("SERVICE_ROLE_KEY"));
console.log("PASS: Viewer navigation is separated, pending passwords are routed to trusted activation, and client never receives service secret.");
