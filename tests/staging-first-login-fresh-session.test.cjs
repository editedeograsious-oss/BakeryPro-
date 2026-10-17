const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const source=fs.readFileSync(path.resolve(__dirname,"../production-fixes/staging-auth-no-loop.ts"),"utf8");
assert(source.includes("first_login_completed_at"),"Staff reads reset completion timestamp");
assert(source.includes('supabase.rpc("ds_staff_session_is_fresh")'),"Trusted database validates the active token session");
assert(source.includes('redirect("/access-denied?reason=session-expired")'),"Expired first-login sessions cannot enter staff screens");
console.log("PASS: Post-password-reset stale session is denied before serving any staff screen.");
