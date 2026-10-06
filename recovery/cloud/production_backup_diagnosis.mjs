import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {decryptBundle} from './encrypted_bundle.mjs';
import {sha256} from '../archive.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const production='sgmmiymjnqqorvtvpigw';
const within=(parent,child)=>{const relative=path.relative(parent,child);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));};

// Inspect only error lines. Return a fixed category, never a connection,
// password, hostname, SQL message, identifier, file path or database value.
export function classifyProductionBackupLog(log) {
  if(typeof log!=='string') throw Error('Invalid private diagnosis input');
  const errorLines=log.split(/\r?\n/).filter(line=>/\b(?:ERROR|FATAL):|^(?:psql|pg_dump|supabase):\s+error:|^Error:|^failed\b/i.test(line)).join('\n');
  const checks=[
    ['SOURCE_AUTHENTICATION_FAILED',/password authentication failed|SASL authentication failed|authentication failed for user|incorrect password/i],
    ['SOURCE_POOLER_IDENTITY_REJECTED',/Tenant or user not found/i],
    ['SOURCE_HOST_UNRESOLVED',/could not translate host name|Name or service not known|Temporary failure in name resolution|no such host/i],
    ['SOURCE_NETWORK_UNREACHABLE',/Network is unreachable|No route to host/i],
    ['SOURCE_CONNECTION_REFUSED',/Connection refused/i],
    ['SOURCE_CONNECTION_TIMEOUT',/timeout expired|Connection timed out|context deadline exceeded/i],
    ['SOURCE_TLS_REJECTED',/SSL error|certificate verify failed|server does not support SSL|TLS handshake|tls:.*(?:error|failed)/i],
    ['SOURCE_CONNECTION_LIMIT',/too many clients|remaining connection slots|Max client connections/i],
    ['SOURCE_MANIFEST_ACCESS_REJECTED',/Owner or manager access required|An active Owner is required|permission denied|must be owner/i],
    ['SOURCE_OPERATION_GUARD_REJECTED',/Live operations must remain disabled|Production Lock must remain ON/i],
    ['SOURCE_EXPORT_VERSION_MISMATCH',/server version mismatch|pg_dump.*version mismatch/i],
    ['SOURCE_EXPORT_SQL_REJECTED',/\b(?:ERROR|FATAL):/]
  ];
  const code=checks.find(([,pattern])=>pattern.test(errorLines))?.[0]||'UNKNOWN_PRODUCTION_BACKUP_FAILURE';
  return {format_version:1,scope:'error_categories_only',source_scope:'production',failed_stage:'backup',database_restore_compared:false,diagnosis_code:code};
}

export async function diagnoseProductionBackupBundle(env=process.env) {
  const hash=/^[a-f0-9]{64}$/;
  if(!env.DIAGNOSIS_INPUT_DIR||!hash.test(env.DIAGNOSIS_BUNDLE_SHA256||'')||!/^[a-f0-9]{40}$/.test(env.DIAGNOSIS_CODE_SHA||'')) throw Error('Invalid diagnosis configuration');
  const input=path.resolve(env.DIAGNOSIS_INPUT_DIR,'recovery-bundle.enc');
  const stat=fs.lstatSync(input);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>64*1024*1024||await sha256(input)!==env.DIAGNOSIS_BUNDLE_SHA256) throw Error('Encrypted input rejected');
  const base=path.resolve(env.RUNNER_TEMP||os.tmpdir());
  if(within(repo,base)) throw Error('Private diagnosis requires a temporary directory outside source control');
  const work=fs.mkdtempSync(path.join(base,'ds-bakery-production-diagnosis-'));fs.chmodSync(work,0o700);
  try {
    const archive=path.join(work,'private.tar.gz');
    await decryptBundle(input,archive,env.BACKUP_ENCRYPTION_PASSPHRASE);
    const member=name=>{
      const result=spawnSync('tar',['-xOzf',archive,'--',name],{env:{PATH:process.env.PATH,LANG:'C.UTF-8'},encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:30000,maxBuffer:16*1024*1024});
      if(result.error||result.status!==0) throw Error('Private diagnosis member unavailable');
      return result.stdout;
    };
    const result=JSON.parse(member('./recovery_result.json'));
    if(result.format_version!==1||result.scope!=='database_only'||result.status!=='failed'||result.stage!=='backup'||result.database_restore_compared!==false||result.source_project_ref!==production||result.target_kind!=='runner-local'||result.target_project_ref!==null||result.temporary_target_removed!==true||result.archive_sha256!==null||result.backup_label!==null||result.recovery_code_commit!==env.DIAGNOSIS_CODE_SHA) throw Error('Recovery identity rejected');
    return classifyProductionBackupLog(member('./private.log'));
  } finally {fs.rmSync(work,{recursive:true,force:true});}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {console.log(JSON.stringify(await diagnoseProductionBackupBundle(),null,2));}
  catch {console.error('Private production backup diagnosis failed [DIAGNOSIS_INPUT_REJECTED]. No password, connection, database content or exception details are printed.');process.exitCode=1;}
}
