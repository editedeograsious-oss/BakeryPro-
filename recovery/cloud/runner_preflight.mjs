import fs from 'node:fs';
import path from 'node:path';
import {RunnerTarget} from './runner_target.mjs';

const base=process.env.RUNNER_TEMP;
if(!base) throw Error('The runner temporary directory is required');
const work=fs.mkdtempSync(path.join(base,'ds-bakery-preflight-'));
const logfd=fs.openSync(path.join(work,'preflight.log'),'wx',0o600);
const target=new RunnerTarget(work,logfd,process.env);
try {
  console.log('Checking a fresh temporary Supabase database. No bakery connection or secrets are used.');
  await target.create();
  target.assertIsolated();
  const result=target.psql('CREATE TABLE public.recovery_runner_probe(id integer primary key, amount numeric); ALTER TABLE public.recovery_runner_probe ENABLE ROW LEVEL SECURITY; INSERT INTO public.recovery_runner_probe VALUES(1,12345); SELECT amount FROM public.recovery_runner_probe; DROP TABLE public.recovery_runner_probe;');
  if(!result.includes('12345')) throw Error('Temporary database query did not match');
  console.log('PASS: PostgreSQL 17, managed Auth schema, empty bootstrap, isolated container and test-only SQL verified.');
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
