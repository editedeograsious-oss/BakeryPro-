import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {checkPassphrase,encryptBundle} from './encrypted_bundle.mjs';
import {validateSource,validateTarget} from '../connection_guard.mjs';
import {sha256} from '../archive.mjs';

const recoveryRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repo=path.dirname(recoveryRoot),staging='kymadepeuqhcsjwbrgqq';
const within=(parent,child)=>{const relative=path.relative(parent,child);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));};

export async function runCloudRecovery(environment=process.env) {
  // Validate before starting a command or creating a backup. The first online drill is staging only.
  checkPassphrase(environment.BACKUP_ENCRYPTION_PASSPHRASE);
  if(environment.SOURCE_PROJECT_REF!==staging) throw Error('The first online recovery workflow requires staging');
  validateSource(environment.DATABASE_URL,staging);
  validateTarget(environment.TARGET_DATABASE_URL,environment.TARGET_PROJECT_REF,staging);
  if(environment.RESTORE_CONFIRM!=='RESTORE_TO_TEST_ONLY'||environment.SOURCE_QUIET_CONFIRMED!=='true') throw Error('Restore and quiet-source checks are required');
  if(!environment.CLOUD_RECOVERY_ARTIFACT_DIR) throw Error('Choose an encrypted-artifact output directory');
  const base=path.resolve(environment.CLOUD_RECOVERY_TEMP_DIR||environment.RUNNER_TEMP||os.tmpdir());
  const artifacts=path.resolve(environment.CLOUD_RECOVERY_ARTIFACT_DIR);
  if(within(repo,base)||within(base,artifacts)||within(artifacts,base)) throw Error('Private temporary files and artifact outputs must be separate');
  fs.mkdirSync(artifacts,{mode:0o700});
  const work=fs.mkdtempSync(path.join(base,'ds-bakery-cloud-'));
  const bundle=work+'.tar.gz';
  const log=path.join(work,'private.log');let logfd=fs.openSync(log,'wx',0o600);
  const backups=path.join(work,'backups'),results=path.join(work,'restore');
  fs.mkdirSync(results,{mode:0o700});
  const env={...environment,BACKUP_DIR:backups,TMPDIR:results};
  const summary={format_version:1,scope:'database_only',source_project_ref:staging,target_project_ref:environment.TARGET_PROJECT_REF,
    status:'failed',stage:'backup',database_restore_compared:false,backup_label:null,archive_sha256:null,
    recovery_code_commit:environment.CLOUD_RECOVERY_CODE_SHA||null};
  const command=(program,args,timeout=20*60*1000)=>{
    const result=spawnSync(program,args,{env,stdio:['ignore',logfd,logfd],timeout});
    if(result.error||result.status!==0) throw Error('Recovery command did not complete successfully');
  };
  try {
    try {
      console.log('Exporting staging. Detailed output stays in the encrypted bundle.');
      command('bash',[path.join(recoveryRoot,'backup.sh')]);
      const labels=fs.readdirSync(backups).filter(name=>/^ds_bakery_\d{8}T\d{6}Z_[A-Za-z0-9]+$/.test(name)&&fs.statSync(path.join(backups,name)).isDirectory());
      if(labels.length!==1) throw Error('Expected one complete database archive');
      summary.backup_label=labels[0];
      const folder=path.join(backups,labels[0]),archive=folder+'.tar.gz';
      summary.archive_sha256=await sha256(archive);
      summary.stage='restore';
      console.log('Comparing a restore in the separate empty target.');
      command('bash',[path.join(recoveryRoot,'restore_test.sh'),folder,archive]);
      summary.status='passed';summary.stage='complete';summary.database_restore_compared=true;
    } catch(error) {fs.writeSync(logfd,'\nCloud wrapper: '+String(error.stack)+'\n');}
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
    return summary;
  } finally {
    if(logfd!==null) fs.closeSync(logfd);
    fs.rmSync(work,{recursive:true,force:true});fs.rmSync(bundle,{force:true});
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {const result=await runCloudRecovery();if(result.status!=='passed') process.exitCode=1;}
  catch {console.error('Online recovery setup failed. Check the required private secrets, target identity and manual confirmations. No database details are printed.');process.exitCode=1;}
}
