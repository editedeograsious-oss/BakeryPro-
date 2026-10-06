import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {payloadFiles,sha256} from '../recovery/archive.mjs';
import {RunnerTarget,requireHostedRunner,validateIsolatedContainer,targetPsqlArgs,isolatedEntrypoint} from '../recovery/cloud/runner_target.mjs';

const id='c'.repeat(64),runId='d'.repeat(64),imageId='sha256:'+'a'.repeat(64),volume='supabase_db_ds_bakery_recovery_'+runId.slice(0,16);
const proof={container_id:id,run_id:runId,image_id:imageId,source_image:'public.ecr.aws/supabase/postgres:17.11.0.002',volume_name:volume};
const container=()=>({Id:id,Image:imageId,Name:'/ds_bakery_isolated_'+runId.slice(0,16),Config:{Labels:{'ds-bakery.recovery.run':runId,'ds-bakery.recovery.kind':'isolated-restore'}},State:{Running:true},HostConfig:{NetworkMode:'none',PortBindings:{}},NetworkSettings:{Networks:{none:{}},Ports:{'5432/tcp':null}},Mounts:[{Type:'volume',Name:volume,Destination:'/var/lib/postgresql/data'}]});
const env={GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',DATABASE_URL:'TEST-ONLY-SENSITIVE-SOURCE',BACKUP_ENCRYPTION_PASSPHRASE:'TEST-ONLY-SENSITIVE-PASSPHRASE',SUPABASE_ACCESS_TOKEN:'TEST-ONLY-SENSITIVE-TOKEN'};
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

test('runner target rejects laptop/cloud target strings and every weakened isolation condition',()=>{
  assert.throws(()=>requireHostedRunner({...env,GITHUB_ACTIONS:'false'}));
  assert.throws(()=>requireHostedRunner({...env,RUNNER_ENVIRONMENT:'self-hosted'}));
  assert.throws(()=>requireHostedRunner({...env,TARGET_DATABASE_URL:'postgresql://hosted-target'}));
  assert(validateIsolatedContainer(container(),proof));
  for(const weaken of [
    c=>c.Id='b'.repeat(64),c=>c.Image='sha256:'+'b'.repeat(64),c=>c.Config.Labels['ds-bakery.recovery.run']='wrong',
    c=>c.HostConfig.NetworkMode='bridge',c=>c.HostConfig.PortBindings={'5432/tcp':[{HostPort:'54322'}]},
    c=>c.NetworkSettings.Ports={'5432/tcp':[{HostIp:'127.0.0.1',HostPort:'54322'}]},
    c=>c.NetworkSettings.Networks={none:{},bridge:{}},c=>c.Mounts[0].Name='existing-bakery-data',c=>c.Mounts.push({Type:'bind',Destination:'/private'}),c=>c.State.Running=false
  ]) {const changed=container();weaken(changed);assert.throws(()=>validateIsolatedContainer(changed,proof));}
  assert.throws(()=>targetPsqlArgs('sgmmiymjnqqorvtvpigw'));
  assert.throws(()=>targetPsqlArgs(id,[],'arbitrary-owner'));
  assert.throws(()=>targetPsqlArgs('sgmmiymjnqqorvtvpigw',[],'supabase_admin'));
  const args=targetPsqlArgs(id);assert(args.includes(id));assert(!args.includes('--host'));assert(!args.some(value=>value.includes('supabase.co')));
  const entry=['sh','-c','docker-entrypoint.sh postgres -D /etc/postgresql \n'];
  assert(isolatedEntrypoint(entry,'/var/lib/postgresql/data')[2].includes('cron.launch_active_jobs = off'));
  assert(isolatedEntrypoint(entry,'/var/lib/postgresql/data/pgdata')[2].endsWith(entry[2]));
  assert.throws(()=>isolatedEntrypoint(['bash','-c','test'],'/var/lib/postgresql/data'));
  for(const directory of ['/etc/postgresql','/var/lib/postgresql/data/../../secret',"/var/lib/postgresql/data'; unsafe-command"]) assert.throws(()=>isolatedEntrypoint(entry,directory));
});

test('runner restore refuses occupied targets and failed imports, and compares actual restored money',async()=>{
  const work=fs.mkdtempSync(path.join(os.tmpdir(),'bakery-runner-restore-test-'));
  const logfd=fs.openSync(path.join(work,'log'),'w');
  const counts={profiles:2,purchases:3,purchase_payments:2,payroll_runs:2,payroll_items:6,salary_advances:2,payroll_advance_allocations:1,raw_materials:1};
  const manifest={format_version:1,manifest:{generated_at:'2026-10-06T00:00:00Z',app_version:'0.38.0',latest_migration:38,release_stage:'staging_completion_candidate',critical_counts:counts,
    integrity:{negative_stock_count:0,mobile_money_conflict_count:0,active_owner_count:1},financial_totals:{expenses_total:557000,supplier_payments_total:110000,paid_salary_total:555000,active_payroll_expenses_total:555000,open_salary_advances_total:0}},
    table_counts:counts,auth_user_count:2,guards:{environment_mode:'staging',production_lock:false,operations_enabled:false},migrations:[{version:'20261006102222',name:'fixture'}],
    public_security:Object.keys(counts).sort().map(table=>({table,rls:true,forced:false})),raw_material_stock:[{id:'test-only-flour',quantity:95}]};
  class RestoreTarget extends RunnerTarget {
    constructor() {super(work,logfd,env);this.proof={...proof};this.commands=[];this.occupied=false;this.failImport=false;this.adminIdentity={current_user:'supabase_admin',session_user:'supabase_admin',database:'postgres',superuser:true,can_create_roles:true};this.restored=structuredClone(manifest);this.network='none';}
    inspect() {const c=container();c.HostConfig.NetworkMode=this.network;return c;}
    call(program,args,options={}) {
      this.commands.push({program,args,input:options.input});
      if(args.includes('--single-transaction')&&this.failImport) throw Error('Test-only import failure');
      if(options.input?.includes('public_objects')) return {status:0,stdout:JSON.stringify({public_objects:this.occupied?1:0,auth_users:0,postgres_major:17})};
      if(options.input?.includes("'current_user',current_user")) return {status:0,stdout:JSON.stringify(this.adminIdentity)};
      if(options.input?.includes("current_setting('cron.launch_active_jobs'")) return {status:0,stdout:'off\n'};
      if(options.input?.includes('recovery_verification_manifest')) return {status:0,stdout:JSON.stringify(this.restored)};
      return {status:0,stdout:''};
    }
  }
  try {
    fs.mkdirSync(path.join(work,'restore'));
    const source='kymadepeuqhcsjwbrgqq',backupLabel='ds_bakery_TEST_runner',folder=path.join(work,backupLabel),archive=folder+'.tar.gz';
    fs.mkdirSync(folder);
    for(const name of payloadFiles) fs.writeFileSync(path.join(folder,name),'-- test-only SQL\n');
    fs.writeFileSync(path.join(folder,'source_manifest.json'),JSON.stringify(manifest));
    fs.writeFileSync(path.join(folder,'backup_metadata.json'),JSON.stringify({format_version:1,scope:'database_only',source_project_ref:source,backup_label:backupLabel}));
    execFileSync(process.execPath,[path.join(repo,'recovery/archive.mjs'),'seal',folder]);
    execFileSync('tar',['-C',work,'-czf',archive,backupLabel]);fs.writeFileSync(archive+'.sha256',await sha256(archive));
    const occupied=new RestoreTarget();occupied.occupied=true;
    await assert.rejects(()=>occupied.restore(folder,archive,source),/not empty/);
    assert(!occupied.commands.some(c=>c.args[0]==='cp'||c.args.includes('--single-transaction')));
    const exposed=new RestoreTarget();exposed.network='bridge';
    await assert.rejects(()=>exposed.restore(folder,archive,source),/no network/);assert.equal(exposed.commands.length,0);
    const failed=new RestoreTarget();failed.failImport=true;
    await assert.rejects(()=>failed.restore(folder,archive,source),/import failure/);
    assert(!failed.commands.some(c=>c.input?.includes('recovery_verification_manifest')));
    for(const changed of [{superuser:false},{can_create_roles:false},{current_user:'postgres'},{session_user:'postgres'},{database:'template1'}]) {
      const unverified=new RestoreTarget();Object.assign(unverified.adminIdentity,changed);
      await assert.rejects(()=>unverified.restore(folder,archive,source),/administrator was not verified/);
      assert(!unverified.commands.some(c=>c.args[0]==='cp'||c.args.includes('--single-transaction')||c.input?.includes('DROP SCHEMA')));
    }
    const mismatch=new RestoreTarget();mismatch.restored.manifest.financial_totals.supplier_payments_total+=10000;
    await assert.rejects(()=>mismatch.restore(folder,archive,source),/comparison failed/);
    const matched=new RestoreTarget();assert(await matched.restore(folder,archive,source));
    const command=matched.commands.find(c=>c.args.includes('--single-transaction'));
    assert(command.args.includes('ON_ERROR_STOP=1'));
    assert.equal(command.args[command.args.indexOf('--username')+1],'supabase_admin');
    assert(command.args.indexOf('SET ROLE postgres')<command.args.indexOf('/tmp/ds-bakery-import/schema.sql'));
    assert(command.args.indexOf('SET ROLE postgres')>command.args.indexOf('/tmp/ds-bakery-import/roles.sql'));
    assert(command.args.indexOf('RESET ROLE; SET session_replication_role = replica')<command.args.indexOf('/tmp/ds-bakery-import/data.sql'));
    assert(command.args.indexOf('RESET ROLE; SET session_replication_role = replica')>command.args.indexOf('/tmp/ds-bakery-import/history_schema.sql'));
    assert(matched.commands.filter(c=>c.input?.includes('recovery_verification_manifest')).every(c=>c.args[c.args.indexOf('--username')+1]==='postgres'));
    assert(!matched.commands.some(c=>c.args.includes('--host')||c.args.some(a=>a.includes('supabase.co'))));
  } finally {fs.closeSync(logfd);fs.rmSync(work,{recursive:true,force:true});}
});

test('mock bootstrap creates only a fresh isolated target, strips source secrets and cleans exact resources',async()=>{
  // This fake command interface never starts Docker or contacts a real database.
  const work=fs.mkdtempSync(path.join(os.tmpdir(),'bakery-runner-target-test-'));
  const logfd=fs.openSync(path.join(work,'log'),'w');
  class FakeTarget extends RunnerTarget {
    constructor(...args) {super(...args);this.commands=[];this.resources=new Map();this.volumeExists=false;}
    call(program,args,options={}) {
      this.commands.push({program,args,input:options.input});
      const success=stdout=>({status:0,stdout:stdout||''});
      if(program==='supabase') {
        if(args[0]==='init') {const directory=path.join(this.workspace,'supabase');fs.mkdirSync(directory);fs.writeFileSync(path.join(directory,'config.toml'),'project_id = "test"\n[db]\nmajor_version = 15\n');}
        else if(args[0]==='db'&&args[1]==='start'&&!args.includes('--help')) {
          const bootstrap={Id:'b'.repeat(64),Image:imageId,Name:'/'+this.bootstrapName,Config:{Image:proof.source_image,Env:['POSTGRES_PASSWORD=local-only'],Entrypoint:['sh'],Cmd:['-c','docker-entrypoint.sh postgres -D /etc/postgresql']},Mounts:[{Type:'volume',Name:this.volumeName,Destination:'/var/lib/postgresql/data'}]};
          this.resources.set(this.bootstrapName,bootstrap);this.resources.set(bootstrap.Id,bootstrap);this.volumeExists=true;
        }
        return success();
      }
      if(args[0]==='inspect'&&this.volumeExists) return success(JSON.stringify([{Name:this.volumeName,Driver:'local'}]));
      if(args[0]==='container'&&args[1]==='inspect') {const value=this.resources.get(args[2]);return value?success(JSON.stringify([value])):{status:1,stdout:''};}
      if(args[0]==='volume'&&args[1]==='inspect') return this.volumeExists?success('[{}]'):{status:1,stdout:''};
      if(args[0]==='create') {
        assert(args.includes('none'));assert(!args.includes('--publish'));
        const created=container();created.Config.Labels['ds-bakery.recovery.run']=this.runId;created.Name='/ds_bakery_isolated_'+this.runId.slice(0,16);created.Mounts[0].Name=this.volumeName;
        this.resources.set(id,created);return success(id+'\n');
      }
      if(args[0]==='exec'&&args.includes('psql')) {
        if(options.input==='select 1;') return success('1\n');
        if(options.input?.includes('public_objects')) return success('{"public_objects":0,"auth_users":0,"postgres_major":17,"data_directory":"/var/lib/postgresql/data"}\n');
        if(options.input?.includes("current_setting('cron.launch_active_jobs'")) return success('off\n');
        return success('');
      }
      if(args[0]==='rm') {const value=this.resources.get(args.at(-1));if(value){this.resources.delete(value.Id);this.resources.delete(value.Name.slice(1));}return success();}
      if(args[0]==='volume'&&args[1]==='rm') {this.volumeExists=false;return success();}
      return success();
    }
  }
  try {
    const target=new FakeTarget(work,logfd,env);
    assert(!target.env.DATABASE_URL);assert(!target.env.SUPABASE_ACCESS_TOKEN);assert(!target.env.BACKUP_ENCRYPTION_PASSPHRASE);
    await target.create();target.assertIsolated();
    assert(target.commands.some(c=>c.program==='supabase'&&c.args.join(' ')==='db start --help'));
    assert(target.commands.some(c=>c.program==='docker'&&c.args.includes('create')&&c.args.includes(imageId)));
    assert(target.commands.some(c=>c.program==='docker'&&c.args[0]==='create'&&c.args.some(a=>a.includes('cron.launch_active_jobs = off')&&a.includes('/postgresql.auto.conf'))));
    const created=target.commands.find(c=>c.program==='docker'&&c.args[0]==='create');
    assert.equal(created.args.filter(a=>a==='-c').length,1,'Docker Entrypoint/Cmd are combined exactly once');
    assert(!target.commands.some(c=>c.args.some(a=>a.includes('TEST-ONLY-SENSITIVE'))));
    const config=fs.readFileSync(path.join(target.workspace,'supabase','config.toml'),'utf8');assert(config.includes('major_version = 17'));assert(config.includes(target.project));
    target.cleanup();assert.equal(target.resources.size,0);assert.equal(target.volumeExists,false);
    assert(!target.commands.some(c=>c.program==='docker'&&c.args[0]==='inspect'),'container lookups never resolve a same-name volume');
    assert(!target.commands.some(c=>c.args.includes('--all')||c.args.includes('prune')));
    const other=new FakeTarget(path.join(work,'not-started'),logfd,env);other.volumeExists=true;other.cleanup();assert.equal(other.volumeExists,true,'cleanup does not touch a volume until fresh bootstrap was attempted');
  } finally {fs.closeSync(logfd);fs.rmSync(work,{recursive:true,force:true});}
});
