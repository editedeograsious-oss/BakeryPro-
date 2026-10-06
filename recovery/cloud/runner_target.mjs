import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {verifyFolder,verifyBinding,sha256} from '../archive.mjs';
import {compareManifests} from '../manifest.mjs';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const postgresVersion='17.11.0.002';
const imagePattern=/^(?:public\.ecr\.aws\/supabase|supabase)\/postgres:17\.11\.0\.002$/;
const hashPattern=/^[a-f0-9]{64}$/;
const label='ds-bakery.recovery.run';

export function requireHostedRunner(env) {
  if(env.GITHUB_ACTIONS!=='true'||env.RUNNER_ENVIRONMENT!=='github-hosted') throw Error('Disposable target requires a GitHub-hosted runner');
  if(env.TARGET_DATABASE_URL||env.TARGET_PROJECT_REF) throw Error('Disposable target does not accept a hosted target connection');
}

export function validateIsolatedContainer(container,proof) {
  if(!proof||!hashPattern.test(proof.container_id||'')||!hashPattern.test(proof.run_id||'')||
    !/^sha256:[a-f0-9]{64}$/.test(proof.image_id||'')||!imagePattern.test(proof.source_image||'')) throw Error('Invalid disposable target proof');
  if(container.Id!==proof.container_id||container.Image!==proof.image_id||container.Config?.Labels?.[label]!==proof.run_id||
    container.Config?.Labels?.['ds-bakery.recovery.kind']!=='isolated-restore'||container.State?.Running!==true) throw Error('Disposable target identity changed');
  if(container.HostConfig?.NetworkMode!=='none'||Object.keys(container.HostConfig?.PortBindings||{}).length||
    Object.keys(container.NetworkSettings?.Ports||{}).some(port=>container.NetworkSettings.Ports[port]?.length)||
    Object.keys(container.NetworkSettings?.Networks||{}).some(network=>network!=='none')) throw Error('Disposable restore requires no network and no published ports');
  const mounts=container.Mounts||[];
  if(mounts.length!==1||mounts[0].Type!=='volume'||mounts[0].Name!==proof.volume_name||mounts[0].Destination!=='/var/lib/postgresql/data') throw Error('Disposable target volume changed');
  return true;
}

export function targetPsqlArgs(id,args=[]) {
  if(!hashPattern.test(id||'')) throw Error('A full disposable container identity is required');
  return ['exec','-i','--user','postgres',id,'psql','--no-psqlrc','--quiet','--variable','ON_ERROR_STOP=1','--username','postgres','--dbname','postgres',...args];
}

export function isolatedEntrypoint(entry,dataDirectory) {
  if(!Array.isArray(entry)||entry.length<3||entry[0]!=='sh'||entry[1]!=='-c'||typeof entry[2]!=='string'||!entry[2]) throw Error('Unexpected bootstrap entrypoint');
  if(typeof dataDirectory!=='string'||!/^\/var\/lib\/postgresql\/data(?:\/[A-Za-z0-9_.-]+)*$/.test(dataDirectory)||dataDirectory.split('/').some(part=>part==='.'||part==='..')) throw Error('Database data directory is outside the fresh mounted volume');
  // Preserve the pinned CLI's startup script. The old container is stopped;
  // the replacement sets this in its fresh volume before starting PostgreSQL.
  // Reading back the effective value is required before any archive import.
  const prefix="printf '\\n%s\\n' 'cron.launch_active_jobs = off' >> '"+dataDirectory+"/postgresql.auto.conf'\n";
  return [entry[0],entry[1],prefix+entry[2],...entry.slice(3)];
}

export class RunnerTarget {
  constructor(work,logfd,environment) {
    requireHostedRunner(environment);
    this.work=work;this.logfd=logfd;this.env={...environment};
    for(const name of Object.keys(this.env)) if(name.startsWith('SUPABASE_')||['DATABASE_URL','TARGET_DATABASE_URL','BACKUP_ENCRYPTION_PASSPHRASE'].includes(name)) delete this.env[name];
    this.env.SUPABASE_EXPERIMENTAL_STACK='0';
    this.runId=randomBytes(32).toString('hex');this.project='ds_bakery_recovery_'+this.runId.slice(0,16);
    this.bootstrapName='supabase_db_'+this.project;this.volumeName=this.bootstrapName;
    this.workspace=path.join(work,'temporary-supabase');this.proof=null;this.createdId=null;this.bootstrapId=null;this.bootstrapAttempted=false;
  }
  call(program,args,{input,capture=false,allowFailure=false,timeout=20*60*1000}={}) {
    const result=spawnSync(program,args,{env:this.env,input,stdio:['pipe',capture?'pipe':this.logfd,this.logfd],encoding:'utf8',maxBuffer:20*1024*1024,timeout});
    if(!allowFailure&&(result.error||result.status!==0)) throw Error('Disposable target command failed: '+program+' '+args.slice(0,2).join(' '));
    return result;
  }
  inspect(id) {return JSON.parse(this.call('docker',['inspect',id],{capture:true}).stdout)[0];}
  assertIsolated() {validateIsolatedContainer(this.inspect(this.proof?.container_id),this.proof);}
  psql(sql,{capture=true}={}) {
    this.assertIsolated();
    return this.call('docker',targetPsqlArgs(this.proof.container_id,['--tuples-only','--no-align']),{input:sql,capture}).stdout;
  }
  async create() {
    // The unique name and volume must not exist before the fresh CLI bootstrap.
    if(this.call('docker',['inspect',this.bootstrapName],{capture:true,allowFailure:true}).status===0||
      this.call('docker',['volume','inspect',this.volumeName],{capture:true,allowFailure:true}).status===0) throw Error('Disposable bootstrap resources already exist');
    fs.mkdirSync(this.workspace,{mode:0o700});
    this.call('supabase',['init','--workdir',this.workspace,'--yes']);
    const configFile=path.join(this.workspace,'supabase','config.toml');
    let config=fs.readFileSync(configFile,'utf8');
    if(!/^project_id\s*=\s*"[^"\n]+"/m.test(config)||!/^major_version\s*=\s*\d+/m.test(config)) throw Error('Unexpected local CLI configuration');
    config=config.replace(/^project_id\s*=\s*"[^"\n]+"/m,'project_id = "'+this.project+'"').replace(/^major_version\s*=\s*\d+/m,'major_version = 17');
    fs.writeFileSync(configFile,config,{mode:0o600});
    fs.mkdirSync(path.join(this.workspace,'supabase','.temp'),{recursive:true,mode:0o700});
    fs.writeFileSync(path.join(this.workspace,'supabase','.temp','postgres-version'),postgresVersion+'\n',{mode:0o600});
    this.call('supabase',['db','start','--help']);
    this.bootstrapAttempted=true;
    this.call('supabase',['db','start','--workdir',this.workspace,'--yes']);
    const initial=this.inspect(this.bootstrapName);
    if(!hashPattern.test(initial.Id||'')||!imagePattern.test(initial.Config?.Image||'')||initial.Name!=='/'+this.bootstrapName||
      initial.Mounts?.length!==1||initial.Mounts[0].Type!=='volume'||initial.Mounts[0].Name!==this.volumeName||
      initial.Mounts[0].Destination!=='/var/lib/postgresql/data') throw Error('Unexpected Supabase bootstrap identity');
    this.bootstrapId=initial.Id;
    const empty=JSON.parse(this.call('docker',targetPsqlArgs(initial.Id,['--tuples-only','--no-align']),{capture:true,input:emptyTargetSql}).stdout);
    if(empty.public_objects!==0||empty.auth_users!==0||empty.postgres_major!==17) throw Error('Supabase bootstrap is not an empty PostgreSQL 17 target');
    this.call('docker',['stop',initial.Id]);
    // Reuse only this fresh data volume; the replacement gets no network or host port.
    const args=['create','--name','ds_bakery_isolated_'+this.runId.slice(0,16),'--network','none','--restart','no',
      '--label',label+'='+this.runId,'--label','ds-bakery.recovery.kind=isolated-restore',
      '--mount','type=volume,source='+this.volumeName+',target=/var/lib/postgresql/data'];
    for(const value of initial.Config.Env||[]) args.push('--env',value);
    const entry=isolatedEntrypoint(initial.Config.Entrypoint,empty.data_directory);
    args.push('--entrypoint',entry[0],initial.Image,...entry.slice(1),...(initial.Config.Cmd||[]));
    const id=this.call('docker',args,{capture:true}).stdout.trim();
    if(!hashPattern.test(id)) throw Error('Invalid created container identity');
    this.createdId=id;
    this.proof={format_version:1,container_id:id,run_id:this.runId,image_id:initial.Image,source_image:initial.Config.Image,volume_name:this.volumeName,network:'none',published_ports:0};
    this.call('docker',['start',id]);
    const deadline=Date.now()+90000;let ready=false;
    while(Date.now()<deadline) {
      const result=this.call('docker',targetPsqlArgs(id,['--tuples-only','--no-align']),{capture:true,allowFailure:true,input:'select 1;'});
      if(result.status===0&&result.stdout.trim()==='1') {ready=true;break;}
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
    if(!ready) throw Error('Disposable PostgreSQL did not become ready');
    this.assertIsolated();
    fs.writeFileSync(path.join(this.work,'runner_target_proof.json'),JSON.stringify(this.proof,null,2)+'\n',{mode:0o600});
    if(this.psql("select current_setting('cron.launch_active_jobs', true);").trim()!=='off') throw Error('Scheduled jobs are not disabled in the disposable target');
    this.call('docker',['rm',initial.Id]);this.bootstrapId=null;
    return this;
  }
  async restore(folder,archive,sourceRef) {
    this.assertIsolated();
    await verifyFolder(folder,sourceRef);await verifyBinding(folder,archive);
    const expected=fs.readFileSync(archive+'.sha256','utf8').trim();
    if(!/^[a-f0-9]{64}$/.test(expected)||expected!==await sha256(archive)) throw Error('Archive hash mismatch');
    const state=JSON.parse(this.psql(emptyTargetSql));
    if(state.public_objects!==0||state.auth_users!==0||state.postgres_major!==17) throw Error('Restore target is not empty');
    if(this.psql("select current_setting('cron.launch_active_jobs', true);").trim()!=='off') throw Error('Scheduled jobs are not disabled in the disposable target');
    // CLI bootstrap can create an empty migration-history schema. Refuse nonempty history.
    this.psql("DO $$DECLARE occupied boolean; BEGIN IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN EXECUTE 'SELECT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations)' INTO occupied; IF occupied THEN RAISE EXCEPTION 'Target migration history is not empty'; END IF; END IF; END$$;\nDROP SCHEMA IF EXISTS supabase_migrations CASCADE;\nALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role;\nALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;\nALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role;\n");
    const importDir='/tmp/ds-bakery-import';
    this.call('docker',['exec',this.proof.container_id,'mkdir','-p',importDir]);
    const names=['roles.sql','schema.sql','history_schema.sql','data.sql','history_data.sql'];
    for(const name of names) this.call('docker',['cp',path.join(folder,name),this.proof.container_id+':'+importDir+'/'+name]);
    this.call('docker',['exec','--user','root',this.proof.container_id,'chown','-R','postgres:postgres',importDir]);
    const options=['--single-transaction'];
    for(const name of names) {if(name==='data.sql') options.push('--command','SET session_replication_role = replica');options.push('--file',importDir+'/'+name);}
    this.assertIsolated();this.call('docker',targetPsqlArgs(this.proof.container_id,options));
    const restored=JSON.parse(this.psql(fs.readFileSync(path.join(root,'capture_manifest.sql'),'utf8')));
    fs.writeFileSync(path.join(this.work,'restore','restored_manifest.json'),JSON.stringify(restored,null,2)+'\n',{mode:0o600});
    compareManifests(JSON.parse(fs.readFileSync(path.join(folder,'source_manifest.json'),'utf8')),restored);
    this.call('docker',['exec',this.proof.container_id,'rm','-r','--',importDir]);
    return true;
  }
  cleanup() {
    // Remove only exact freshly-created container IDs and their verified unique volume.
    if(!this.bootstrapAttempted&&!this.createdId) return;
    if(this.createdId) {
      const container=this.inspect(this.createdId);
      if(container.Config?.Labels?.[label]!==this.runId||container.Name!=='/ds_bakery_isolated_'+this.runId.slice(0,16)) throw Error('Cleanup container identity mismatch');
      this.call('docker',['rm','--force',this.createdId]);this.createdId=null;
    }
    if(!this.bootstrapId) {
      const probe=this.call('docker',['inspect',this.bootstrapName],{capture:true,allowFailure:true});
      if(probe.status===0) {
        const candidate=JSON.parse(probe.stdout)[0];
        if(candidate.Name!=='/'+this.bootstrapName||!imagePattern.test(candidate.Config?.Image||'')||candidate.Mounts?.length!==1||candidate.Mounts[0].Name!==this.volumeName) throw Error('Cleanup bootstrap identity mismatch');
        this.bootstrapId=candidate.Id;
      }
    }
    if(this.bootstrapId) {
      const container=this.inspect(this.bootstrapId);
      if(container.Name!=='/'+this.bootstrapName||container.Mounts?.[0]?.Name!==this.volumeName) throw Error('Cleanup bootstrap identity mismatch');
      this.call('docker',['rm','--force',this.bootstrapId]);this.bootstrapId=null;
    }
    const existing=this.call('docker',['volume','inspect',this.volumeName],{capture:true,allowFailure:true});
    if(existing.status===0) this.call('docker',['volume','rm',this.volumeName]);
  }
}

const emptyTargetSql="select jsonb_build_object('public_objects',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','S')),'auth_users',(select count(*) from auth.users),'postgres_major',current_setting('server_version_num')::int / 10000,'data_directory',current_setting('data_directory'));";
