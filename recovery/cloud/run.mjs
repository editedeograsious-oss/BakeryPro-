import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {checkPassphrase,encryptBundle} from './encrypted_bundle.mjs';
import {validateSource,validateTarget} from '../connection_guard.mjs';
import {sha256} from '../archive.mjs';
import {RunnerTarget,requireHostedRunner} from './runner_target.mjs';
import {classifyRecoveryLog} from './diagnose.mjs';

const recoveryRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repo=path.dirname(recoveryRoot),staging='kymadepeuqhcsjwbrgqq';
const within=(parent,child)=>{const relative=path.relative(parent,child);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));};

// Public setup diagnostics are fixed strings. Never print an exception message,
// URL, passphrase, filesystem path or subprocess output from this boundary.
const setupMessages=Object.freeze({
  BACKUP_PASSPHRASE:'Update BAKERY_BACKUP_PASSPHRASE privately with a unique random value of at least 32 characters.',
  SOURCE_PROJECT:'This recovery workflow requires the reviewed staging project.',
  SOURCE_CONNECTION:'Update BAKERY_STAGING_DATABASE_URL privately with the complete staging direct/session-pooler URI on port 5432. Replace the password placeholder, remove its square brackets and encode password symbols.',
  RUNNER_TARGET:'The temporary target requires a GitHub-hosted runner and accepts no hosted target connection.',
  TARGET_KIND:'Use the reviewed recovery target kind.',
  HOSTED_TARGET:'A hosted restore target must be separate from both bakery databases and match its explicit project reference.',
  MANUAL_CONFIRMATIONS:'Type RESTORE_TO_TEST_ONLY and confirm staging writes are paused.',
  ARTIFACT_DIRECTORY:'The encrypted-artifact directory and private temporary directory must be configured separately.'
});
class RecoverySetupError extends Error {
  constructor(code) {super('Recovery setup check failed');this.code=code;}
}
const setupCheck=(code,check)=>{try {check();}catch {throw new RecoverySetupError(code);}};
export function recoveryFailureMessage(error) {
  if(error instanceof RecoverySetupError&&Object.hasOwn(setupMessages,error.code)) return 'Online recovery setup failed ['+error.code+']. '+setupMessages[error.code]+' No secret values are printed.';
  return 'Online recovery setup failed. Check the required private secrets, target identity and manual confirmations. No database details are printed.';
}

export async function runCloudRecovery(environment=process.env) {
  // Validate before starting a command or creating a backup. The first online drill is staging only.
  setupCheck('BACKUP_PASSPHRASE',()=>checkPassphrase(environment.BACKUP_ENCRYPTION_PASSPHRASE));
  setupCheck('SOURCE_PROJECT',()=>{if(environment.SOURCE_PROJECT_REF!==staging) throw Error();});
  setupCheck('SOURCE_CONNECTION',()=>validateSource(environment.DATABASE_URL,staging));
  const temporaryTarget=environment.RESTORE_TARGET_KIND==='runner-local';
  if(temporaryTarget) setupCheck('RUNNER_TARGET',()=>requireHostedRunner(environment));
  else if(environment.RESTORE_TARGET_KIND&&environment.RESTORE_TARGET_KIND!=='hosted') throw new RecoverySetupError('TARGET_KIND');
  else setupCheck('HOSTED_TARGET',()=>validateTarget(environment.TARGET_DATABASE_URL,environment.TARGET_PROJECT_REF,staging));
  if(environment.RESTORE_CONFIRM!=='RESTORE_TO_TEST_ONLY'||environment.SOURCE_QUIET_CONFIRMED!=='true') throw new RecoverySetupError('MANUAL_CONFIRMATIONS');
  if(!environment.CLOUD_RECOVERY_ARTIFACT_DIR) throw new RecoverySetupError('ARTIFACT_DIRECTORY');
  const base=path.resolve(environment.CLOUD_RECOVERY_TEMP_DIR||environment.RUNNER_TEMP||os.tmpdir());
  const artifacts=path.resolve(environment.CLOUD_RECOVERY_ARTIFACT_DIR);
  if(within(repo,base)||within(base,artifacts)||within(artifacts,base)) throw new RecoverySetupError('ARTIFACT_DIRECTORY');
  fs.mkdirSync(artifacts,{mode:0o700});
  const work=fs.mkdtempSync(path.join(base,'ds-bakery-cloud-'));
  const bundle=work+'.tar.gz';
  const log=path.join(work,'private.log');let logfd=fs.openSync(log,'wx',0o600);
  const backups=path.join(work,'backups'),results=path.join(work,'restore');
  fs.mkdirSync(results,{mode:0o700});
  const env={...environment,BACKUP_DIR:backups,TMPDIR:results};
  const summary={format_version:1,scope:'database_only',source_project_ref:staging,target_kind:temporaryTarget?'runner-local':'hosted',target_project_ref:environment.TARGET_PROJECT_REF||null,
    status:'failed',stage:'backup',database_restore_compared:false,backup_label:null,archive_sha256:null,
    recovery_code_commit:environment.CLOUD_RECOVERY_CODE_SHA||null};
  const command=(program,args,timeout=20*60*1000)=>{
    const result=spawnSync(program,args,{env,stdio:['ignore',logfd,logfd],timeout});
    if(result.error||result.status!==0) throw Error('Recovery command did not complete successfully');
  };
  let local=null;
  try {
    try {
      if(temporaryTarget) {
        summary.stage='temporary-target';
        console.log('Preparing the isolated temporary restore database on this runner.');
        local=new RunnerTarget(work,logfd,env);await local.create();
      }
      summary.stage='backup';
      console.log('Exporting staging. Detailed output stays in the encrypted bundle.');
      command('bash',[path.join(recoveryRoot,'backup.sh')]);
      const labels=fs.readdirSync(backups).filter(name=>/^ds_bakery_\d{8}T\d{6}Z_[A-Za-z0-9]+$/.test(name)&&fs.statSync(path.join(backups,name)).isDirectory());
      if(labels.length!==1) throw Error('Expected one complete database archive');
      summary.backup_label=labels[0];
      const folder=path.join(backups,labels[0]),archive=folder+'.tar.gz';
      summary.archive_sha256=await sha256(archive);
      summary.stage='restore';
      console.log('Comparing a restore in the separate empty target.');
      if(local) await local.restore(folder,archive,staging);
      else command('bash',[path.join(recoveryRoot,'restore_test.sh'),folder,archive]);
      summary.status='passed';summary.stage='complete';summary.database_restore_compared=true;
    } catch(error) {
      fs.writeSync(logfd,'\nCloud wrapper: '+String(error.stack)+'\n');
      if(summary.stage==='restore') summary.restore_diagnosis=classifyRecoveryLog(fs.readFileSync(log,'utf8'));
    }
    if(local) {
      try {local.cleanup();summary.temporary_target_removed=true;}
      catch(error) {summary.status='failed';summary.stage='cleanup';summary.temporary_target_removed=false;fs.writeSync(logfd,'\nCleanup: '+String(error.stack)+'\n');}
    }
    summary.completed_at=new Date().toISOString();
    fs.writeFileSync(path.join(work,'recovery_result.json'),JSON.stringify(summary,null,2)+'\n',{mode:0o600});
    // Everything produced by the database tools, including failure details, stays in this private bundle.
    fs.closeSync(logfd);logfd=null;
    const packed=spawnSync('tar',['-C',work,'-czf',bundle,'.'],{env,stdio:'ignore',timeout:5*60*1000});
    if(packed.error||packed.status!==0) throw Error('Private bundle packaging failed');
    const encrypted=path.join(artifacts,'recovery-bundle.enc');
    await encryptBundle(bundle,encrypted,environment.BACKUP_ENCRYPTION_PASSPHRASE);
    summary.encrypted_bundle_sha256=await sha256(encrypted);
    fs.writeFileSync(encrypted+'.sha256',summary.encrypted_bundle_sha256+'  recovery-bundle.enc\n',{mode:0o600});
    fs.writeFileSync(path.join(artifacts,'result.json'),JSON.stringify(summary,null,2)+'\n',{mode:0o600});
    console.log(summary.status==='passed'?'Database recovery comparison passed. Retain the encrypted bundle; the launch gate is unchanged.':'Recovery comparison did not pass. Failure details are encrypted.');
    if(summary.restore_diagnosis) console.log('Restore diagnosis: '+JSON.stringify(summary.restore_diagnosis));
    return summary;
  } finally {
    if(logfd!==null) fs.closeSync(logfd);
    fs.rmSync(work,{recursive:true,force:true});fs.rmSync(bundle,{force:true});
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {const result=await runCloudRecovery();if(result.status!=='passed') process.exitCode=1;}
  catch(error) {console.error(recoveryFailureMessage(error));process.exitCode=1;}
}
