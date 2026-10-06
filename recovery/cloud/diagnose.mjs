import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {decryptBundle} from './encrypted_bundle.mjs';
import {sha256} from '../archive.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const staging='kymadepeuqhcsjwbrgqq';
const within=(parent,child)=>{const relative=path.relative(parent,child);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));};
const platformRoles=new Set(['postgres','anon','authenticated','service_role','authenticator','supabase_admin','supabase_auth_admin','supabase_storage_admin','supabase_read_only_user','dashboard_user','pgbouncer']);
const comparisonFields=['manifest','table_counts','auth_user_count','guards','migrations','public_security','raw_material_stock'];
const reasonFor=message=>{
  if(/role "[^"]+" already exists/.test(message)) return 'ROLE_ALREADY_EXISTS';
  if(/schema "[^"]+" already exists/.test(message)) return 'SCHEMA_ALREADY_EXISTS';
  if(/already exists/.test(message)) return 'OBJECT_ALREADY_EXISTS';
  if(/must be owner/.test(message)) return 'TARGET_OBJECT_OWNERSHIP';
  if(/permission denied|must be superuser|not permitted/.test(message)) return 'PERMISSION_DENIED';
  if(/column .* does not exist|extra data after last expected column|missing data for column/.test(message)) return 'COLUMN_COMPATIBILITY';
  if(/relation .* does not exist|schema .* does not exist/.test(message)) return 'MISSING_TARGET_OBJECT';
  if(/duplicate key value/.test(message)) return 'DUPLICATE_DATA_KEY';
  if(/foreign key constraint/.test(message)) return 'FOREIGN_KEY_CONSTRAINT';
  if(/violates not-null constraint/.test(message)) return 'NULL_CONSTRAINT';
  if(/invalid input syntax/.test(message)) return 'DATA_TYPE_COMPATIBILITY';
  if(/unrecognized configuration parameter/.test(message)) return 'POSTGRES_SETTING_COMPATIBILITY';
  return 'SQL_ERROR';
};

// Only fixed categories, a fixed filename, a bounded line number and known
// platform roles can leave this boundary. Never return a message or SQL value.
export function classifyRecoveryLog(log) {
  if(typeof log!=='string') throw Error('Invalid private diagnosis input');
  const report={format_version:1,scope:'error_categories_only',database_restore_compared:false,
    diagnosis_code:'UNKNOWN_RESTORE_FAILURE',import_file:null,import_line:null,platform_role:null};
  for(const line of log.split(/\r?\n/)) {
    const match=/^psql:(?:[^:\r\n]*\/)?(roles\.sql|schema\.sql|history_schema\.sql|data\.sql|history_data\.sql):([0-9]{1,9}):\s+(?:ERROR|FATAL):\s+(.*)$/.exec(line);
    if(!match) continue;
    report.diagnosis_code=reasonFor(match[3]);report.import_file=match[1];report.import_line=Number(match[2]);
    const role=/role "([^"]+)"/.exec(match[3])?.[1];
    if(platformRoles.has(role)) report.platform_role=role;
    return report;
  }
  if(log.includes('Recovery comparison failed:')) {
    report.diagnosis_code='RESTORED_MANIFEST_MISMATCH';
    const line=log.split(/\r?\n/).find(line=>line.includes('Recovery comparison failed:'));
    report.comparison_fields=comparisonFields.filter(field=>new RegExp('(?:^|[ ,:])'+field+'(?:$|[, ])').test(line));
  } else if(/Restore target is not empty|Target migration history is not empty/.test(log)) report.diagnosis_code='TARGET_NOT_EMPTY';
  else if(log.includes('Scheduled jobs are not disabled')) report.diagnosis_code='TARGET_SCHEDULED_JOBS_ACTIVE';
  else if(/Archive hash mismatch|Archive SHA-256 mismatch|Backup checksum mismatch|Backup folder does not match/.test(log)) report.diagnosis_code='ARCHIVE_INTEGRITY_CHECK_FAILED';
  else {
    const error=log.split(/\r?\n/).find(line=>/^ERROR:\s+/.test(line));
    if(error) report.diagnosis_code=reasonFor(error);
  }
  return report;
}

export async function diagnoseRecoveryBundle(env=process.env) {
  const hash=/^[a-f0-9]{64}$/;
  if(!env.DIAGNOSIS_INPUT_DIR||!hash.test(env.DIAGNOSIS_BUNDLE_SHA256||'')||!hash.test(env.DIAGNOSIS_ARCHIVE_SHA256||'')||!/^[a-f0-9]{40}$/.test(env.DIAGNOSIS_CODE_SHA||'')) throw Error('Invalid diagnosis configuration');
  const input=path.resolve(env.DIAGNOSIS_INPUT_DIR,'recovery-bundle.enc');
  const stat=fs.lstatSync(input);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>64*1024*1024||await sha256(input)!==env.DIAGNOSIS_BUNDLE_SHA256) throw Error('Encrypted input rejected');
  const base=path.resolve(env.RUNNER_TEMP||os.tmpdir());
  if(within(repo,base)) throw Error('Private diagnosis requires a temporary directory outside source control');
  const work=fs.mkdtempSync(path.join(base,'ds-bakery-diagnosis-'));fs.chmodSync(work,0o700);
  try {
    const archive=path.join(work,'private.tar.gz');
    await decryptBundle(input,archive,env.BACKUP_ENCRYPTION_PASSPHRASE);
    const member=name=>{
      const result=spawnSync('tar',['-xOzf',archive,'--',name],{env:{PATH:process.env.PATH,LANG:'C.UTF-8'},encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:30000,maxBuffer:16*1024*1024});
      if(result.error||result.status!==0) throw Error('Private diagnosis member unavailable');
      return result.stdout;
    };
    const result=JSON.parse(member('./recovery_result.json'));
    if(result.status!=='failed'||result.stage!=='restore'||result.database_restore_compared!==false||result.source_project_ref!==staging||result.target_kind!=='runner-local'||result.temporary_target_removed!==true||result.archive_sha256!==env.DIAGNOSIS_ARCHIVE_SHA256||result.recovery_code_commit!==env.DIAGNOSIS_CODE_SHA) throw Error('Recovery identity rejected');
    return classifyRecoveryLog(member('./private.log'));
  } finally {fs.rmSync(work,{recursive:true,force:true});}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {console.log(JSON.stringify(await diagnoseRecoveryBundle(),null,2));}
  catch {console.error('Private recovery diagnosis failed [DIAGNOSIS_INPUT_REJECTED]. No password, database content or exception details are printed.');process.exitCode=1;}
}
