import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {classifyProductionBackupLog,diagnoseProductionBackupBundle} from '../recovery/cloud/production_backup_diagnosis.mjs';
import {encryptBundle} from '../recovery/cloud/encrypted_bundle.mjs';
import {sha256} from '../recovery/archive.mjs';

test('production backup diagnosis emits fixed categories without private connection or SQL values',()=>{
  const secret='PRIVATE-PRODUCTION-PASSWORD-ACCOUNTS-557000';
  for(const [error,code] of [
    ['FATAL: password authentication failed for user "'+secret+'"','SOURCE_AUTHENTICATION_FAILED'],
    ['FATAL: Tenant or user not found '+secret,'SOURCE_POOLER_IDENTITY_REJECTED'],
    ['psql: error: could not translate host name "'+secret+'" to address: Name or service not known','SOURCE_HOST_UNRESOLVED'],
    ['psql: error: Network is unreachable '+secret,'SOURCE_NETWORK_UNREACHABLE'],
    ['psql: error: Connection refused '+secret,'SOURCE_CONNECTION_REFUSED'],
    ['psql: error: timeout expired '+secret,'SOURCE_CONNECTION_TIMEOUT'],
    ['psql: error: SSL error: certificate verify failed '+secret,'SOURCE_TLS_REJECTED'],
    ['FATAL: remaining connection slots are reserved '+secret,'SOURCE_CONNECTION_LIMIT'],
    ['ERROR: permission denied for table '+secret,'SOURCE_MANIFEST_ACCESS_REJECTED'],
    ['ERROR: Live operations must remain disabled during this recovery drill '+secret,'SOURCE_OPERATION_GUARD_REJECTED'],
    ['pg_dump: error: aborting because of server version mismatch '+secret,'SOURCE_EXPORT_VERSION_MISMATCH'],
    ['ERROR: relation "'+secret+'" does not exist','SOURCE_EXPORT_SQL_REJECTED'],
    ['unknown exception '+secret,'UNKNOWN_PRODUCTION_BACKUP_FAILURE']
  ]) {
    const report=classifyProductionBackupLog(error+'\npostgresql://'+secret+'@'+secret+'\nDETAIL: '+secret);
    assert.equal(report.diagnosis_code,code);assert.equal(report.database_restore_compared,false);
    assert(!JSON.stringify(report).includes(secret));assert(!JSON.stringify(report).includes('postgresql://'));
    assert.deepEqual(Object.keys(report),['format_version','scope','source_scope','failed_stage','database_restore_compared','diagnosis_code']);
  }
  assert.equal(classifyProductionBackupLog('a data value says password authentication failed').diagnosis_code,'UNKNOWN_PRODUCTION_BACKUP_FAILURE');
  assert.throws(()=>classifyProductionBackupLog({password:secret}));
});

test('production backup diagnosis verifies ciphertext and strict failed-source identity, and removes plaintext',async()=>{
  const work=fs.mkdtempSync(path.join(os.tmpdir(),'bakery-production-diagnosis-test-'));
  const passphrase='TEST-ONLY-PRODUCTION-DIAGNOSIS-KEY-1234567890';
  try {
    const content=path.join(work,'content'),input=path.join(work,'input'),privateBase=path.join(work,'private');
    for(const p of [content,input,privateBase])fs.mkdirSync(p);
    const result={format_version:1,scope:'database_only',status:'failed',stage:'backup',database_restore_compared:false,source_project_ref:'sgmmiymjnqqorvtvpigw',target_kind:'runner-local',target_project_ref:null,temporary_target_removed:true,archive_sha256:null,backup_label:null,recovery_code_commit:'c'.repeat(40)};
    fs.writeFileSync(path.join(content,'private.log'),'psql: error: connection failed: FATAL: password authentication failed for user "PRIVATE-SENSITIVE-PRODUCTION-DATA"\n');
    const archive=path.join(work,'fixture.tar.gz'),encrypted=path.join(input,'recovery-bundle.enc');
    const seal=async value=>{
      fs.writeFileSync(path.join(content,'recovery_result.json'),JSON.stringify(value));
      assert.equal(spawnSync('tar',['-C',content,'-czf',archive,'.']).status,0);
      fs.rmSync(encrypted,{force:true});await encryptBundle(archive,encrypted,passphrase);
      return {DIAGNOSIS_INPUT_DIR:input,DIAGNOSIS_BUNDLE_SHA256:await sha256(encrypted),DIAGNOSIS_CODE_SHA:result.recovery_code_commit,BACKUP_ENCRYPTION_PASSPHRASE:passphrase,RUNNER_TEMP:privateBase};
    };
    const env=await seal(result);
    const report=await diagnoseProductionBackupBundle(env);assert.equal(report.diagnosis_code,'SOURCE_AUTHENTICATION_FAILED');assert(!JSON.stringify(report).includes('PRIVATE-SENSITIVE'));
    assert.deepEqual(fs.readdirSync(privateBase),[]);
    for(const override of [{DIAGNOSIS_BUNDLE_SHA256:'a'.repeat(64)},{BACKUP_ENCRYPTION_PASSPHRASE:passphrase+'wrong'},{DIAGNOSIS_CODE_SHA:'a'.repeat(40)}]) {
      await assert.rejects(()=>diagnoseProductionBackupBundle({...env,...override}));assert.deepEqual(fs.readdirSync(privateBase),[]);
    }
    const cli=spawnSync(process.execPath,['recovery/cloud/production_backup_diagnosis.mjs'],{env:{...process.env,...env,BACKUP_ENCRYPTION_PASSPHRASE:passphrase+'wrong'},encoding:'utf8'});
    assert.notEqual(cli.status,0);assert.equal(cli.stdout,'');assert(cli.stderr.includes('[DIAGNOSIS_INPUT_REJECTED]'));assert(!cli.stderr.includes(passphrase));assert(!cli.stderr.includes(work));
    for(const override of [{source_project_ref:'kymadepeuqhcsjwbrgqq'},{stage:'restore'},{status:'passed'},{temporary_target_removed:false},{target_project_ref:'sgmmiymjnqqorvtvpigw'},{target_kind:'hosted'},{archive_sha256:'b'.repeat(64)},{backup_label:'unreviewed'},{database_restore_compared:true}]) {
      const changed=await seal({...result,...override});await assert.rejects(()=>diagnoseProductionBackupBundle(changed));assert.deepEqual(fs.readdirSync(privateBase),[]);
    }
  } finally {fs.rmSync(work,{recursive:true,force:true});}
});
