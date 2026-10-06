import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {classifyRecoveryLog,diagnoseRecoveryBundle} from '../recovery/cloud/diagnose.mjs';
import {encryptBundle} from '../recovery/cloud/encrypted_bundle.mjs';
import {sha256} from '../recovery/archive.mjs';

test('diagnosis reveals fixed error categories without private SQL values or unknown identifiers',()=>{
  const privateValue='PRIVATE-BAKERY-CUSTOMER-PASSWORD-557000';
  for(const [error,expected] of [
    ['role "anon" already exists','ROLE_ALREADY_EXISTS'],
    ['role "'+privateValue+'" already exists','ROLE_ALREADY_EXISTS'],
    ['must be owner of table '+privateValue,'TARGET_OBJECT_OWNERSHIP'],
    ['permission denied for '+privateValue,'PERMISSION_DENIED'],
    ['column "'+privateValue+'" does not exist','COLUMN_COMPATIBILITY'],
    ['relation "'+privateValue+'" does not exist','MISSING_TARGET_OBJECT'],
    ['duplicate key value violates unique constraint "'+privateValue+'"','DUPLICATE_DATA_KEY'],
    ['unknown '+privateValue,'SQL_ERROR']
  ]) {
    const report=classifyRecoveryLog('psql:/tmp/ds-bakery-import/schema.sql:123: ERROR: '+error+'\nDETAIL: '+privateValue+'\n');
    assert.equal(report.diagnosis_code,expected);assert.equal(report.import_file,'schema.sql');assert.equal(report.import_line,123);
    assert.equal(report.database_restore_compared,false);assert(!JSON.stringify(report).includes(privateValue));
    assert.equal(report.platform_role,error.includes('"anon"')?'anon':null);
  }
  assert.equal(classifyRecoveryLog('ERROR: must be superuser\nPRIVATE-DATA').diagnosis_code,'PERMISSION_DENIED');
  const mismatch=classifyRecoveryLog('Error: Recovery comparison failed: manifest, raw_material_stock, PRIVATE-IDENTIFIER');
  assert.deepEqual(mismatch.comparison_fields,['manifest','raw_material_stock']);assert(!JSON.stringify(mismatch).includes('PRIVATE-IDENTIFIER'));
  assert.equal(classifyRecoveryLog('unknown private exception').diagnosis_code,'UNKNOWN_RESTORE_FAILURE');
});

test('private diagnosis authenticates the exact archive and cleans plaintext on success and failure',async()=>{
  const work=fs.mkdtempSync(path.join(os.tmpdir(),'bakery-diagnosis-test-'));
  const passphrase='TEST-ONLY-PRIVATE-DIAGNOSIS-KEY-1234567890';
  try {
    const content=path.join(work,'content'),input=path.join(work,'input'),privateBase=path.join(work,'private');
    for(const p of [content,input,privateBase])fs.mkdirSync(p);
    const result={status:'failed',stage:'restore',database_restore_compared:false,source_project_ref:'kymadepeuqhcsjwbrgqq',target_kind:'runner-local',temporary_target_removed:true,archive_sha256:'b'.repeat(64),recovery_code_commit:'c'.repeat(40)};
    fs.writeFileSync(path.join(content,'recovery_result.json'),JSON.stringify(result));
    fs.writeFileSync(path.join(content,'private.log'),'psql:/tmp/ds-bakery-import/roles.sql:14: ERROR: role "anon" already exists\nDETAIL: PRIVATE-SENSITIVE-BAKERY-DATA\n');
    const archive=path.join(work,'fixture.tar.gz');
    assert.equal(spawnSync('tar',['-C',content,'-czf',archive,'.']).status,0);
    const encrypted=path.join(input,'recovery-bundle.enc');await encryptBundle(archive,encrypted,passphrase);
    const env={DIAGNOSIS_INPUT_DIR:input,DIAGNOSIS_BUNDLE_SHA256:await sha256(encrypted),DIAGNOSIS_ARCHIVE_SHA256:result.archive_sha256,DIAGNOSIS_CODE_SHA:result.recovery_code_commit,BACKUP_ENCRYPTION_PASSPHRASE:passphrase,RUNNER_TEMP:privateBase};
    const report=await diagnoseRecoveryBundle(env);assert.equal(report.diagnosis_code,'ROLE_ALREADY_EXISTS');assert.equal(report.platform_role,'anon');assert(!JSON.stringify(report).includes('PRIVATE-SENSITIVE'));
    assert.deepEqual(fs.readdirSync(privateBase),[]);
    for(const override of [{DIAGNOSIS_BUNDLE_SHA256:'a'.repeat(64)},{BACKUP_ENCRYPTION_PASSPHRASE:passphrase+'wrong'},{DIAGNOSIS_ARCHIVE_SHA256:'a'.repeat(64)},{DIAGNOSIS_CODE_SHA:'a'.repeat(40)}]) {
      await assert.rejects(()=>diagnoseRecoveryBundle({...env,...override}));assert.deepEqual(fs.readdirSync(privateBase),[]);
    }
    const cli=spawnSync(process.execPath,['recovery/cloud/diagnose.mjs'],{env:{...process.env,...env,BACKUP_ENCRYPTION_PASSPHRASE:passphrase+'wrong'},encoding:'utf8'});
    assert.notEqual(cli.status,0);assert.equal(cli.stdout,'');assert(cli.stderr.includes('[DIAGNOSIS_INPUT_REJECTED]'));assert(!cli.stderr.includes(passphrase));assert(!cli.stderr.includes(work));
  } finally {fs.rmSync(work,{recursive:true,force:true});}
});
