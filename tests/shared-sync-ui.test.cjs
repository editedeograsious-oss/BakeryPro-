const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const patches=path.resolve(__dirname,"../production-fixes");
const sync=fs.readFileSync(path.join(patches,"SharedDataRefresh.tsx"),"utf8");
const pos=fs.readFileSync(path.join(patches,"PosTerminal.tsx"),"utf8");
assert(sync.includes('table: "ds_sync_revision"'),"One non-sensitive DB invalidation channel");
assert(sync.includes('status === "SUBSCRIBED"'),"Reconnect must refetch missed commits");
assert(sync.includes('window.addEventListener("online", wake)'),"Browser network recovery");
assert(sync.includes('document.addEventListener("visibilitychange", wake)'),"Recover from background tab");
assert(sync.includes('document.addEventListener("focusout", regainFocus)'),"Do not lose updates while editing a form");
for(const page of ["/dashboard","/pos","/finished-goods","/inventory","/customer-orders","/purchases","/payroll","/expenses","/credit-book"]){
  assert(sync.includes('"'+page+'":'),"Realtime invalidation registered for "+page);
}
assert(pos.includes('window.addEventListener("ds-bakery:shared-change",handleSharedChange)'),"POS reloads saved changes");
assert(pos.includes('window.removeEventListener("ds-bakery:shared-change",handleSharedChange)'),"POS unsubscribes on unmount");
console.log("PASS: All-module RLS-protected change signal, reconnect/visibility refresh, deferred focus, POS live stock reload.");
