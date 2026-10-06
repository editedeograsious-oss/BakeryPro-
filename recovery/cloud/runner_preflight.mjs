import fs from 'node:fs';
import path from 'node:path';
import {RunnerTarget,targetPsqlArgs} from './runner_target.mjs';

const base=process.env.RUNNER_TEMP;
if(!base) throw Error('The runner temporary directory is required');
const work=fs.mkdtempSync(path.join(base,'ds-bakery-preflight-'));
const logfd=fs.openSync(path.join(work,'preflight.log'),'wx',0o600);
const target=new RunnerTarget(work,logfd,process.env);
try {
  console.log('Checking a fresh temporary Supabase database. No bakery connection or secrets are used.');
  await target.create();
  target.assertIsolated();
  const capabilities=JSON.parse(target.psql("SELECT jsonb_object_agg(rolname,jsonb_build_object('superuser',rolsuper,'can_create_roles',rolcreaterole)) FROM pg_roles WHERE rolname IN ('postgres','supabase_admin');"));
  if(capabilities.postgres?.superuser!==false||capabilities.supabase_admin?.superuser!==true) throw Error('Temporary platform role privileges differ from the reviewed target');
  console.log('Temporary platform-role capabilities: '+JSON.stringify(capabilities));
  const roleSql='CREATE ROLE recovery_runner_probe_role NOLOGIN; ALTER ROLE recovery_runner_probe_role BYPASSRLS;';
  const restricted=target.call('docker',targetPsqlArgs(target.proof.container_id,['--single-transaction','--command',roleSql]),{capture:true,allowFailure:true});
  if(restricted.status===0||target.psql("SELECT count(*) FROM pg_roles WHERE rolname='recovery_runner_probe_role';").trim()!=='0') throw Error('Restricted role-import probe did not roll back');
  target.restorePsql(['--single-transaction',
    '--command',roleSql,
    '--command','SET ROLE postgres',
    '--command','CREATE TABLE public.recovery_runner_probe(id integer primary key, amount numeric); ALTER TABLE public.recovery_runner_probe ENABLE ROW LEVEL SECURITY;',
    '--command','RESET ROLE; SET session_replication_role = replica',
    '--command','INSERT INTO public.recovery_runner_probe VALUES(1,12345);'
  ]);
  const result=JSON.parse(target.psql("SELECT jsonb_build_object('amount',(SELECT amount FROM public.recovery_runner_probe WHERE id=1),'owner',(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.recovery_runner_probe'::regclass),'rls',(SELECT relrowsecurity FROM pg_class WHERE oid='public.recovery_runner_probe'::regclass),'probe_role_bypassrls',(SELECT rolbypassrls FROM pg_roles WHERE rolname='recovery_runner_probe_role'),'postgres_superuser',(SELECT rolsuper FROM pg_roles WHERE rolname='postgres'));"));
  if(result.amount!==12345||result.owner!=='postgres'||result.rls!==true||result.probe_role_bypassrls!==true||result.postgres_superuser!==false) throw Error('Temporary privileged import or schema ownership did not match');
  target.restorePsql(['--single-transaction','--command','DROP TABLE public.recovery_runner_probe; DROP ROLE recovery_runner_probe_role;']);
  if(target.psql("SELECT count(*) FROM pg_roles WHERE rolname='recovery_runner_probe_role';").trim()!=='0') throw Error('Test-only role was not removed');
  console.log('PASS: restricted import rolls back; verified local administrator imports roles/data; application schema remains owned by postgres with RLS enabled.');
  console.log('PASS: PostgreSQL 17, managed Auth schema, empty bootstrap, disabled scheduled jobs and isolated container verified.');
  console.log('This is runner readiness only. No real bakery backup/restore or launch evidence was produced.');
} catch(error) {
  console.error('Runner readiness failed: '+error.message);
  // Only this empty/bootstrap-only job uses these logs. No bakery secrets are supplied.
  const lines=fs.readFileSync(path.join(work,'preflight.log'),'utf8').split('\n');
  const safe=lines.filter(line=>/error|failed|not found|denied|does not exist|invalid|timeout|unexpected/i.test(line)).slice(-20);
  for(const line of safe) console.error(line.replace(/postgres(?:ql)?:\/\/\S+/gi,'[connection redacted]').replace(/eyJ[A-Za-z0-9_.-]+/g,'[token redacted]'));
  process.exitCode=1;
} finally {
  try {target.cleanup();} catch(error) {console.error('Temporary resource cleanup failed: '+error.message);process.exitCode=1;}
  fs.closeSync(logfd);fs.rmSync(work,{recursive:true,force:true});
}
