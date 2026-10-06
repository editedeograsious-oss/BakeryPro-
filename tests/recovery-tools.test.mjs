import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validateSource,validateTarget,projectFromUrl,protectedProjects} from '../recovery/connection_guard.mjs';
import {validateManifest,compareManifests} from '../recovery/manifest.mjs';
import {sha256,verifyFolder,verifyBinding,payloadFiles} from '../recovery/archive.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const fresh='abcdefghijklmnopqrst';
const direct=ref=>`postgresql://postgres:test-only-password@db.${ref}.supabase.co:5432/postgres?sslmode=require`;
const pooled=ref=>`postgresql://postgres.${ref}:test-only-password@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`;
const counts={profiles:2,purchases:3,purchase_payments:2,payroll_runs:2,payroll_items:6,salary_advances:2,payroll_advance_allocations:1,raw_materials:1};
function fixture() { return {
  format_version:1,
  manifest:{generated_at:'2026-10-06T00:00:00Z',app_version:'0.38.0',latest_migration:38,release_stage:'staging_completion_candidate',
    critical_counts:{...counts},integrity:{negative_stock_count:0,mobile_money_conflict_count:0,active_owner_count:1},
    financial_totals:{expenses_total:557000,supplier_payments_total:110000,paid_salary_total:555000,active_payroll_expenses_total:555000,open_salary_advances_total:0}},
  table_counts:{...counts},auth_user_count:2,
  guards:{environment_mode:'staging',production_lock:false,operations_enabled:false},
  migrations:[{version:'20261006102222',name:'v038_backup_staff_role_cast_fix'}],
  public_security:Object.keys(counts).sort().map(table=>({table,rls:true,forced:false})),
  raw_material_stock:[{id:'test-flour',quantity:95}]
}; }

test('restore refuses staging and production through direct and pooled URLs',()=>{
  for(const ref of protectedProjects) for(const uri of [direct(ref),pooled(ref)]) {
    assert.throws(()=>validateTarget(uri,ref,protectedProjects[0]),/protected/);
    assert.throws(()=>validateTarget(uri,fresh,protectedProjects[0]),/protected/);
  }
  assert(validateTarget(direct(fresh),fresh,protectedProjects[0]));
  assert(validateTarget(pooled(fresh),fresh,protectedProjects[0]));
});

test('source identity and SSL overrides fail closed without exposing the password',()=>{
  assert(validateSource(direct(protectedProjects[0]),protectedProjects[0]));
  assert.throws(()=>validateSource(direct(fresh),protectedProjects[0]),/mismatch/);
  for(const suffix of ['sslmode=disable','host=db.other.supabase.co']) assert.throws(()=>projectFromUrl(direct(fresh).replace('sslmode=require',suffix)));
  assert.throws(()=>projectFromUrl(direct(fresh).replace(':5432',':6543')),/5432/);
  assert.throws(()=>projectFromUrl('not-a-url'),error=>!error.message.includes('test-only-password'));
});

test('capture timestamps can differ but stock, money, tables, history and RLS must match',()=>{
  const source=fixture(),restored=structuredClone(source);
  restored.manifest.generated_at='2026-10-07T00:00:00Z';
  assert(compareManifests(source,restored));
  for(const mutate of [
    value=>value.manifest.financial_totals.paid_salary_total+=5000,
    value=>value.raw_material_stock[0].quantity=70,
    value=>{value.table_counts.purchase_payments=1;value.manifest.critical_counts.purchase_payments=1;},
    value=>value.migrations[0].version='20261003171212',
    value=>value.public_security[0].forced=true,
    value=>value.auth_user_count=1
  ]) { const changed=structuredClone(restored); mutate(changed); assert.throws(()=>compareManifests(source,changed)); }
});

test('missing evidence and unsafe launch settings cannot pass verification',()=>{
  for(const mutate of [
    value=>delete value.manifest.financial_totals.supplier_payments_total,
    value=>value.migrations=[],
    value=>value.public_security[0].rls=false,
    value=>value.guards.operations_enabled=true,
    value=>{value.guards.environment_mode='production';value.guards.production_lock=false;},
    value=>value.manifest.integrity.negative_stock_count=1,
    value=>delete value.raw_material_stock,
    value=>value.table_counts.purchase_payments=0
  ]) { const invalid=fixture();mutate(invalid);assert.throws(()=>validateManifest(invalid)); }
  const production=fixture();production.guards.environment_mode='production';production.guards.production_lock=true;
  assert(validateManifest(production));
});

test('backup checksums reject corruption and bind the folder to its actual archive',async()=>{
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'bakery-archive-test-'));
  try {
    const label='ds_bakery_TEST_000001',folder=path.join(temporary,label);fs.mkdirSync(folder);
    for(const filename of payloadFiles) fs.writeFileSync(path.join(folder,filename),'-- test-only SQL\n');
    fs.writeFileSync(path.join(folder,'source_manifest.json'),JSON.stringify(fixture()));
    fs.writeFileSync(path.join(folder,'backup_metadata.json'),JSON.stringify({format_version:1,scope:'database_only',source_project_ref:protectedProjects[0],backup_label:label}));
    execFileSync(process.execPath,[path.join(repo,'recovery/archive.mjs'),'seal',folder],{env:{...process.env,SOURCE_PROJECT_REF:protectedProjects[0]}});
    const archive=folder+'.tar.gz';execFileSync('tar',['-C',temporary,'-czf',archive,label]);
    assert(await verifyFolder(folder,protectedProjects[0]));assert(await verifyBinding(folder,archive));
    fs.appendFileSync(path.join(folder,'data.sql'),'changed');
    await assert.rejects(()=>verifyFolder(folder),/checksum/);
    execFileSync(process.execPath,[path.join(repo,'recovery/archive.mjs'),'seal',folder]);
    await assert.rejects(()=>verifyBinding(folder,archive),/does not match/);
    await assert.rejects(()=>verifyFolder(folder,protectedProjects[1]),/different source/);
    assert.match(await sha256(archive),/^[0-9a-f]{64}$/);
  } finally { fs.rmSync(temporary,{recursive:true,force:true}); }
});

test('mocked operator workflow blocks protected/nonempty targets and mismatched restored data',()=>{
  // These executables are test doubles. No Supabase project, export or restore is performed.
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'bakery-recovery-test-'));
  try {
    const bin=path.join(temporary,'bin');fs.mkdirSync(bin);
    const mock=`#!${process.execPath}\nconst fs=require('node:fs');const path=require('node:path');const name=path.basename(process.argv[1]);const args=process.argv.slice(2);fs.appendFileSync(process.env.RECOVERY_TEST_LOG,JSON.stringify({name,args})+'\\n');if(name==='supabase'){const index=args.indexOf('-f');if(index>=0)fs.writeFileSync(args[index+1],'-- test-only dump\\nCREATE TABLE fixture(id int);\\n');}else if(name==='psql'){if(args.includes('--single-transaction'))process.exit(process.env.RECOVERY_IMPORT_FAIL==='1'?1:0);if(args.includes('--command'))console.log(process.env.RECOVERY_TARGET_STATE||'{"public_objects":0,"auth_users":0}');else console.log(process.env.RECOVERY_CAPTURE_JSON);}\n`;
    for(const name of ['psql','supabase','docker'])fs.writeFileSync(path.join(bin,name),mock,{mode:0o700});
    const logfile=path.join(temporary,'commands.log'),backupDirectory=path.join(temporary,'backups');
    const env={...process.env,PATH:bin+path.delimiter+process.env.PATH,RECOVERY_TEST_LOG:logfile,RECOVERY_CAPTURE_JSON:JSON.stringify(fixture()),
      SOURCE_PROJECT_REF:protectedProjects[0],DATABASE_URL:direct(protectedProjects[0]),BACKUP_DIR:backupDirectory,
      TARGET_DATABASE_URL:direct(fresh),TARGET_PROJECT_REF:fresh,RESTORE_CONFIRM:'RESTORE_TO_TEST_ONLY',TMPDIR:temporary};
    const backup=spawnSync('bash',[path.join(repo,'recovery/backup.sh')],{env,encoding:'utf8'});assert.equal(backup.status,0,backup.stderr);
    const label=fs.readdirSync(backupDirectory).find(name=>!name.includes('.'));assert(label);
    const folder=path.join(backupDirectory,label),archive=folder+'.tar.gz';
    assert.equal(fs.statSync(archive).mode & 0o077,0,'archive permissions are private');
    const restore=override=>{fs.writeFileSync(logfile,'');return spawnSync('bash',[path.join(repo,'recovery/restore_test.sh'),folder,archive],{env:{...env,...override},encoding:'utf8'});};
    const commands=()=>fs.readFileSync(logfile,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
    let result=restore({TARGET_DATABASE_URL:direct(protectedProjects[1]),TARGET_PROJECT_REF:protectedProjects[1]});
    assert.notEqual(result.status,0);assert(!commands().some(command=>command.name==='psql'));
    for(const state of [{public_objects:1,auth_users:0},{public_objects:0,auth_users:1}]){
      result=restore({RECOVERY_TARGET_STATE:JSON.stringify(state)});assert.notEqual(result.status,0);
      assert(!commands().some(command=>command.args.includes('--single-transaction')));
    }
    const wrong=fixture();wrong.manifest.financial_totals.expenses_total=837000;
    result=restore({RECOVERY_CAPTURE_JSON:JSON.stringify(wrong)});assert.notEqual(result.status,0);
    assert(!result.stdout.includes('Database comparison passed'));
    result=restore({RECOVERY_IMPORT_FAIL:'1'});assert.notEqual(result.status,0);assert(!result.stdout.includes('Database comparison passed'));
    result=restore({});assert.equal(result.status,0,result.stderr);assert(result.stdout.includes('Database comparison passed'));
    assert(commands().some(command=>command.args.includes('--single-transaction')));
  } finally {fs.rmSync(temporary,{recursive:true,force:true});}
});
