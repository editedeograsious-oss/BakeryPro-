import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {checkPassphrase,encryptBundle,decryptBundle} from '../recovery/cloud/encrypted_bundle.mjs';
import {recoveryFailureMessage,runCloudRecovery} from '../recovery/cloud/run.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const passphrase='TEST-ONLY-RANDOM-BACKUP-PASSPHRASE-2026';
const staging='kymadepeuqhcsjwbrgqq',production='sgmmiymjnqqorvtvpigw',target='abcdefghijklmnopqrst';
const url=ref=>`postgresql://postgres:TEST-ONLY-PRIVATE-PASSWORD@db.${ref}.supabase.co:5432/postgres?sslmode=require`;
const temporary=()=>fs.mkdtempSync(path.join(os.tmpdir(),'bakery-cloud-test-'));

test('unexpected setup errors never expose their private exception message',()=>{
  const message=recoveryFailureMessage(Error('SECRET-URL-AND-PASSWORD-SHOULD-NOT-APPEAR'));
  assert(message.startsWith('Online recovery setup failed.'));
  assert(!message.includes('SECRET-URL-AND-PASSWORD-SHOULD-NOT-APPEAR'));
});

test('unreviewed source scope fails before any command and never exposes scope or URL',async()=>{
  const env={BACKUP_ENCRYPTION_PASSPHRASE:passphrase,SOURCE_PROJECT_REF:production,DATABASE_URL:url(production)};
  for(const scope of ['SECRET-UNREVIEWED-SOURCE','constructor','__proto__']) {
    try {await runCloudRecovery(env,scope);assert.fail('Unexpected source scope accepted');}
    catch(error) {const message=recoveryFailureMessage(error,'production');assert(message.includes('[SOURCE_PROJECT]'));assert(!message.includes('SECRET-'));assert(!message.includes('TEST-ONLY-PRIVATE-PASSWORD'));}
  }
});

test('encrypted bundles round trip and use fresh randomness without exposing plaintext',async()=>{
  const work=temporary();
  try {
    const input=path.join(work,'input'),one=path.join(work,'one.enc'),two=path.join(work,'two.enc'),output=path.join(work,'output');
    const bytes=Buffer.from('TEST-ONLY-SENSITIVE-DATABASE-CONTENT\n'.repeat(30000));fs.writeFileSync(input,bytes);
    await encryptBundle(input,one,passphrase);await encryptBundle(input,two,passphrase);
    assert(!fs.readFileSync(one).includes(Buffer.from('TEST-ONLY-SENSITIVE-DATABASE-CONTENT')));
    assert(!fs.readFileSync(one).equals(fs.readFileSync(two)));
    await decryptBundle(one,output,passphrase);assert(fs.readFileSync(output).equals(bytes));
    assert.equal(fs.statSync(one).mode&0o077,0);assert.equal(fs.statSync(output).mode&0o077,0);
    const empty=path.join(work,'empty');fs.writeFileSync(empty,'');await encryptBundle(empty,empty+'.enc',passphrase);await decryptBundle(empty+'.enc',empty+'.out',passphrase);assert.equal(fs.statSync(empty+'.out').size,0);
  } finally {fs.rmSync(work,{recursive:true,force:true});}
});

test('wrong passphrases, altered headers/ciphertext/tags and truncation leave no plaintext',async()=>{
  const work=temporary();
  try {
    assert.throws(()=>checkPassphrase('short'));
    const input=path.join(work,'input'),encrypted=path.join(work,'encrypted');fs.writeFileSync(input,'sensitive test payload');await encryptBundle(input,encrypted,passphrase);
    const original=fs.readFileSync(encrypted);
    await assert.rejects(()=>decryptBundle(encrypted,path.join(work,'wrong-key'),passphrase+'wrong'));
    assert(!fs.existsSync(path.join(work,'wrong-key')));
    for(const [index,bytes] of [0,22,original.length-17,original.length-1].map(index=>{const changed=Buffer.from(original);changed[index]^=1;return [index,changed];}).concat([['truncated',original.subarray(0,15)]])){
      const modified=path.join(work,'modified-'+index),output=modified+'.out';fs.writeFileSync(modified,bytes);
      await assert.rejects(()=>decryptBundle(modified,output,passphrase));assert(!fs.existsSync(output));
    }
    const existing=path.join(work,'existing');fs.writeFileSync(existing,'keep');await assert.rejects(()=>decryptBundle(encrypted,existing,passphrase));assert.equal(fs.readFileSync(existing,'utf8'),'keep');
    assert(!fs.readdirSync(work).some(name=>name.startsWith('.ds-bakery-decrypt-')));
  } finally {fs.rmSync(work,{recursive:true,force:true});}
});

test('cloud wrapper encrypts mock outputs, suppresses secrets, blocks protected targets and records failures',async()=>{
  // All database/Docker/CLI executables are fake. This does not perform a real export or restore.
  const work=temporary();
  try {
    const counts={profiles:1,purchases:3,purchase_payments:2,payroll_runs:2,payroll_items:6,salary_advances:2,payroll_advance_allocations:1,raw_materials:1};
    const fixture={format_version:1,
      manifest:{generated_at:'2026-10-06T00:00:00Z',app_version:'0.38.0',latest_migration:38,release_stage:'staging_completion_candidate',critical_counts:counts,
        integrity:{negative_stock_count:0,mobile_money_conflict_count:0,active_owner_count:1},financial_totals:{expenses_total:557000,supplier_payments_total:110000,paid_salary_total:555000,active_payroll_expenses_total:555000,open_salary_advances_total:0}},
      table_counts:counts,auth_user_count:1,guards:{environment_mode:'staging',production_lock:false,operations_enabled:false},
      migrations:[{version:'20261006102222',name:'v038_backup_staff_role_cast_fix'}],public_security:Object.keys(counts).sort().map(table=>({table,rls:true,forced:false})),raw_material_stock:[{id:'test-flour',quantity:95}]};
    const bin=path.join(work,'bin'),privateBase=path.join(work,'private');fs.mkdirSync(bin);fs.mkdirSync(privateBase);
    const commands=path.join(work,'commands.log');
    const mock=`#!${process.execPath}\nconst fs=require('node:fs');const path=require('node:path');const name=path.basename(process.argv[1]),args=process.argv.slice(2);fs.appendFileSync(process.env.CLOUD_TEST_COMMANDS,name+'\\n');console.error('TEST-ONLY-SENSITIVE-LOG '+process.env.DATABASE_URL);if(name==='supabase'){const index=args.indexOf('-f');if(index>=0)fs.writeFileSync(args[index+1],'-- TEST-ONLY-SENSITIVE-DUMP\\n');}else if(name==='psql'){if(process.env.CLOUD_TEST_SOURCE_FAIL==='1'){console.error('psql: error: FATAL: password authentication failed for user TEST-ONLY-SENSITIVE-SOURCE');process.exit(1);}if(args.includes('--single-transaction')){if(process.env.CLOUD_TEST_IMPORT_FAIL==='1'){console.error('psql:/tmp/ds-bakery-import/roles.sql:13: ERROR: permission denied for TEST-ONLY-SENSITIVE-IDENTIFIER');process.exit(1);}process.exit(0);}if(args.includes('--command'))console.log('{"public_objects":0,"auth_users":0}');else console.log(process.env.CLOUD_TEST_MANIFEST);}\n`;
    for(const name of ['psql','supabase','docker'])fs.writeFileSync(path.join(bin,name),mock,{mode:0o700});
    const env={...process.env,PATH:bin+path.delimiter+process.env.PATH,DATABASE_URL:url(staging),SOURCE_PROJECT_REF:staging,
      TARGET_DATABASE_URL:url(target),TARGET_PROJECT_REF:target,RESTORE_CONFIRM:'RESTORE_TO_TEST_ONLY',SOURCE_QUIET_CONFIRMED:'true',
      BACKUP_ENCRYPTION_PASSPHRASE:passphrase,CLOUD_RECOVERY_TEMP_DIR:privateBase,CLOUD_TEST_COMMANDS:commands,CLOUD_TEST_MANIFEST:JSON.stringify(fixture)};
    const run=(name,override={})=>spawnSync(process.execPath,[path.join(repo,'recovery/cloud/run.mjs')],{env:{...env,CLOUD_RECOVERY_ARTIFACT_DIR:path.join(work,name),...override},encoding:'utf8'});
    for(const [name,override,code] of [
      ['protected',{TARGET_DATABASE_URL:url(production),TARGET_PROJECT_REF:production},'HOSTED_TARGET'],
      ['production-source',{DATABASE_URL:url(production),SOURCE_PROJECT_REF:production},'SOURCE_PROJECT'],
      ['source-url-hash',{DATABASE_URL:url(staging)+'#SECRET-URL-SUFFIX'},'SOURCE_CONNECTION'],
      ['source-url-password-only',{DATABASE_URL:'SECRET-NOT-A-CONNECTION-STRING'},'SOURCE_CONNECTION'],
      ['quiet-missing',{SOURCE_QUIET_CONFIRMED:'false'},'MANUAL_CONFIRMATIONS'],
      ['confirmation-missing',{RESTORE_CONFIRM:'SECRET-UNEXPECTED-CONFIRMATION'},'MANUAL_CONFIRMATIONS'],
      ['short-password',{BACKUP_ENCRYPTION_PASSPHRASE:'SECRET-SHORT-PASSWORD'},'BACKUP_PASSPHRASE'],
      ['missing-password',{BACKUP_ENCRYPTION_PASSPHRASE:''},'BACKUP_PASSPHRASE'],
      ['temporary-not-hosted',{RESTORE_TARGET_KIND:'runner-local',TARGET_DATABASE_URL:'',TARGET_PROJECT_REF:'',GITHUB_ACTIONS:'false',RUNNER_ENVIRONMENT:'self-hosted'},'RUNNER_TARGET'],
      ['temporary-hosted-url',{RESTORE_TARGET_KIND:'runner-local',GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted'},'RUNNER_TARGET'],
      ['unknown-target-kind',{RESTORE_TARGET_KIND:'SECRET-UNKNOWN-TARGET'},'TARGET_KIND'],
      ['missing-artifact-directory',{CLOUD_RECOVERY_ARTIFACT_DIR:''},'ARTIFACT_DIRECTORY'],
      ['overlapping-artifact-directory',{CLOUD_RECOVERY_ARTIFACT_DIR:privateBase},'ARTIFACT_DIRECTORY']
    ]) {
      const result=run(name,override);assert.notEqual(result.status,0);assert(!fs.existsSync(commands));
      if(name!=='overlapping-artifact-directory') assert(!fs.existsSync(path.join(work,name)));
      assert(result.stderr.includes('['+code+']'),result.stderr);
      assert(!result.stderr.includes('TEST-ONLY-PRIVATE-PASSWORD'));assert(!result.stdout.includes('TEST-ONLY-PRIVATE-PASSWORD'));
      assert(!result.stderr.includes('SECRET-'));assert(!result.stderr.includes(work));
    }
    const productionFixture=structuredClone(fixture);productionFixture.guards={environment_mode:'production',production_lock:true,operations_enabled:false};
    const runProduction=(name,override={})=>spawnSync(process.execPath,[path.join(repo,'recovery/cloud/production.mjs')],{env:{...env,DATABASE_URL:url(production),SOURCE_PROJECT_REF:production,CLOUD_TEST_MANIFEST:JSON.stringify(productionFixture),CLOUD_RECOVERY_ARTIFACT_DIR:path.join(work,name),...override},encoding:'utf8'});
    for(const [name,override,code] of [
      ['production-wrong-source',{SOURCE_PROJECT_REF:staging,DATABASE_URL:url(staging)},'SOURCE_PROJECT'],
      ['production-wrong-url',{DATABASE_URL:url(staging)},'SOURCE_CONNECTION'],
      ['production-missing-url',{DATABASE_URL:''},'SOURCE_CONNECTION'],
      ['production-target-production',{TARGET_DATABASE_URL:url(production),TARGET_PROJECT_REF:production},'HOSTED_TARGET'],
      ['production-target-staging',{TARGET_DATABASE_URL:url(staging),TARGET_PROJECT_REF:staging},'HOSTED_TARGET'],
      ['production-not-quiet',{SOURCE_QUIET_CONFIRMED:'false'},'MANUAL_CONFIRMATIONS']
    ]) {
      const blocked=runProduction(name,override);assert.notEqual(blocked.status,0);assert(!fs.existsSync(commands));
      assert(blocked.stderr.includes('['+code+']'));assert(!blocked.stderr.includes('TEST-ONLY-PRIVATE-PASSWORD'));assert(!blocked.stdout.includes('TEST-ONLY-SENSITIVE'));
      if(code==='SOURCE_CONNECTION') {assert(blocked.stderr.includes('BAKERY_PRODUCTION_DATABASE_URL'));assert(!blocked.stderr.includes('BAKERY_STAGING_DATABASE_URL'));}
    }
    let productionResult=runProduction('production-locked-success');assert.equal(productionResult.status,0,productionResult.stderr);
    const productionSummary=JSON.parse(fs.readFileSync(path.join(work,'production-locked-success','result.json')));
    assert.equal(productionSummary.source_project_ref,production);assert.equal(productionSummary.status,'passed');assert.equal(productionSummary.database_restore_compared,true);
    assert(!productionResult.stdout.includes('TEST-ONLY-PRIVATE-PASSWORD'));assert(!productionResult.stdout.includes('TEST-ONLY-SENSITIVE'));assert.equal(productionResult.stderr,'');
    const unlocked=structuredClone(productionFixture);unlocked.guards.production_lock=false;
    productionResult=runProduction('production-unlocked',{CLOUD_TEST_MANIFEST:JSON.stringify(unlocked)});assert.notEqual(productionResult.status,0);
    assert.equal(JSON.parse(fs.readFileSync(path.join(work,'production-unlocked','result.json'))).database_restore_compared,false);
    productionResult=runProduction('production-mislabelled',{CLOUD_TEST_MANIFEST:JSON.stringify(fixture)});assert.notEqual(productionResult.status,0);
    assert.equal(JSON.parse(fs.readFileSync(path.join(work,'production-mislabelled','result.json'))).database_restore_compared,false);
    assert(!productionResult.stdout.includes('TEST-ONLY-PRIVATE-PASSWORD'));assert(!productionResult.stderr.includes('TEST-ONLY-SENSITIVE'));
    productionResult=runProduction('production-source-authentication',{CLOUD_TEST_SOURCE_FAIL:'1'});
    assert.notEqual(productionResult.status,0);assert(!productionResult.stdout.includes('TEST-ONLY-PRIVATE-PASSWORD'));assert(!productionResult.stdout.includes('TEST-ONLY-SENSITIVE'));assert(!productionResult.stderr.includes('TEST-ONLY-PRIVATE-PASSWORD'));
    const sourceFailure=JSON.parse(fs.readFileSync(path.join(work,'production-source-authentication','result.json')));
    assert.equal(sourceFailure.source_project_ref,production);assert.equal(sourceFailure.stage,'backup');assert.equal(sourceFailure.status,'failed');assert.equal(sourceFailure.database_restore_compared,false);assert.equal(sourceFailure.archive_sha256,null);assert.equal(sourceFailure.backup_label,null);
    assert.equal(sourceFailure.backup_diagnosis.diagnosis_code,'SOURCE_AUTHENTICATION_FAILED');assert(productionResult.stdout.includes('SOURCE_AUTHENTICATION_FAILED'));assert(!JSON.stringify(sourceFailure).includes('TEST-ONLY-SENSITIVE'));
    assert.deepEqual(fs.readdirSync(path.join(work,'production-source-authentication')).sort(),['recovery-bundle.enc','recovery-bundle.enc.sha256','result.json']);assert.deepEqual(fs.readdirSync(privateBase),[]);
    let result=run('success');assert.equal(result.status,0,result.stderr);
    assert(!result.stdout.includes('TEST-ONLY-SENSITIVE'));assert(!result.stdout.includes('TEST-ONLY-PRIVATE-PASSWORD'));assert.equal(result.stderr,'');
    const artifacts=path.join(work,'success');assert.deepEqual(fs.readdirSync(artifacts).sort(),['recovery-bundle.enc','recovery-bundle.enc.sha256','result.json']);
    const summary=JSON.parse(fs.readFileSync(path.join(artifacts,'result.json')));assert.equal(summary.status,'passed');assert.equal(summary.database_restore_compared,true);assert.match(summary.archive_sha256,/^[0-9a-f]{64}$/);
    assert(!JSON.stringify(summary).includes('557000'));assert.equal(fs.readdirSync(privateBase).length,0);
    const decrypted=path.join(work,'decrypted.tar.gz');await decryptBundle(path.join(artifacts,'recovery-bundle.enc'),decrypted,passphrase);
    const contents=execFileSync('tar',['-tzf',decrypted],{encoding:'utf8'});assert(contents.includes('restored_manifest.json'));assert(contents.includes('source_manifest.json'));
    const privateLog=execFileSync('tar',['-xOzf',decrypted,'./private.log'],{encoding:'utf8'});assert(privateLog.includes('TEST-ONLY-SENSITIVE-LOG'));assert(privateLog.includes('TEST-ONLY-PRIVATE-PASSWORD'));
    result=run('failure',{CLOUD_TEST_IMPORT_FAIL:'1'});assert.notEqual(result.status,0);assert(!result.stdout.includes('TEST-ONLY-SENSITIVE'));
    const failed=JSON.parse(fs.readFileSync(path.join(work,'failure','result.json')));assert.equal(failed.status,'failed');assert.equal(failed.stage,'restore');assert.equal(failed.database_restore_compared,false);assert.equal(failed.restore_diagnosis.diagnosis_code,'PERMISSION_DENIED');assert.equal(failed.restore_diagnosis.import_file,'roles.sql');assert.equal(failed.restore_diagnosis.import_line,13);assert(!JSON.stringify(failed).includes('TEST-ONLY-SENSITIVE'));assert(!result.stdout.includes('TEST-ONLY-PRIVATE-PASSWORD'));assert(result.stdout.includes('PERMISSION_DENIED'));assert.equal(fs.readdirSync(privateBase).length,0);
    result=run('temporary-setup-failure',{RESTORE_TARGET_KIND:'runner-local',TARGET_DATABASE_URL:'',TARGET_PROJECT_REF:'',GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted'});
    assert.notEqual(result.status,0);assert(!result.stdout.includes('TEST-ONLY-PRIVATE-PASSWORD'));assert(!result.stderr.includes('TEST-ONLY-SENSITIVE'));
    const setupFailure=JSON.parse(fs.readFileSync(path.join(work,'temporary-setup-failure','result.json')));
    assert.equal(setupFailure.stage,'temporary-target');assert.equal(setupFailure.database_restore_compared,false);assert.equal(setupFailure.backup_label,null);assert.equal(setupFailure.target_project_ref,null);assert.equal(setupFailure.temporary_target_removed,true);
    assert.equal(fs.readdirSync(privateBase).length,0);
  } finally {fs.rmSync(work,{recursive:true,force:true});}
});
