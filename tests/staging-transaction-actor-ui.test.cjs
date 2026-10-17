const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../production-fixes/NotificationCenter.tsx'),'utf8');
test('notifications display server-recorded responsible staff identity',()=>{
 assert(source.includes('actor_id?:string|null'), 'Staff id must be available');
 assert(source.includes('actor_name?:string|null'),'Authenticated actor name must be available');
 assert(source.includes('actor_role?:string|null'),'Staff role must be available');
 assert(source.includes('source_audit_id?:number|null'),'Link to server audit record');
 assert(source.includes('source_audit_id")'),'Fetch from RLS-protected notifications');
 assert(source.includes('Recorded by:'),'Show actor in notification history/toast');
 assert(source.includes('actorLabel(notice)'),'Show actor in popup');
 assert(source.includes('actorLabel(n)'),'Show actor in history');
 assert(source.includes('timeZone:"Africa/Kampala"'),'Display Ugandan event timestamps');
 assert(source.includes('No verified staff identity'),'Never fabricate who recorded an anonymous/system event');
 assert(source.includes('event:"INSERT"'),'Keep real-time push');
});
