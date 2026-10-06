import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { validateManifest } from './manifest.mjs';

export const payloadFiles = ['roles.sql','schema.sql','data.sql','history_schema.sql','history_data.sql','source_manifest.json','backup_metadata.json'];
export async function sha256(filename) {
  const digest=crypto.createHash('sha256');
  for await (const bytes of fs.createReadStream(filename)) digest.update(bytes);
  return digest.digest('hex');
}

export async function verifyFolder(directory, expectedSource = null) {
  const checksums=JSON.parse(fs.readFileSync(path.join(directory,'checksums.json'),'utf8'));
  if (!checksums || Object.keys(checksums).sort().join('|') !== [...payloadFiles].sort().join('|')) throw Error('Incomplete or unexpected backup payload');
  for (const name of payloadFiles) {
    const filename=path.join(directory,name), stat=fs.lstatSync(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size===0) throw Error(`Missing or invalid backup file: ${name}`);
    if (!/^[0-9a-f]{64}$/.test(checksums[name]) || await sha256(filename)!==checksums[name]) throw Error(`Backup checksum mismatch: ${name}`);
  }
  const metadata=JSON.parse(fs.readFileSync(path.join(directory,'backup_metadata.json'),'utf8'));
  if (metadata.format_version!==1 || metadata.scope!=='database_only' || !/^[a-z]{20}$/.test(metadata.source_project_ref || '')) throw Error('Invalid backup source metadata');
  if (expectedSource && metadata.source_project_ref!==expectedSource) throw Error('Backup belongs to a different source project');
  validateManifest(JSON.parse(fs.readFileSync(path.join(directory,'source_manifest.json'),'utf8')));
  return true;
}

export async function verifyBinding(directory, archive) {
  const metadata=JSON.parse(fs.readFileSync(path.join(directory,'backup_metadata.json'),'utf8'));
  if (!/^ds_bakery_[A-Za-z0-9_]+$/.test(metadata.backup_label || '')) throw Error('Invalid archive folder label');
  let archivedChecksums;
  try { archivedChecksums=execFileSync('tar',['-xOzf',archive,metadata.backup_label+'/checksums.json'],{stdio:['ignore','pipe','ignore'],maxBuffer:1024*1024}); }
  catch { throw Error('Unable to verify the matching archive payload'); }
  if (crypto.createHash('sha256').update(archivedChecksums).digest('hex')!==await sha256(path.join(directory,'checksums.json'))) throw Error('Backup folder does not match this archive');
  return true;
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const [command,filename]=process.argv.slice(2);
    if (!filename) throw Error('Usage: node archive.mjs seal|verify|hash|verify-hash <path>');
    if (command==='seal') {
      const checksums={};
      for (const name of payloadFiles) checksums[name]=await sha256(path.join(filename,name));
      fs.writeFileSync(path.join(filename,'checksums.json'),JSON.stringify(checksums,null,2)+'\n',{mode:0o600});
      await verifyFolder(filename,process.env.SOURCE_PROJECT_REF);
    } else if (command==='verify') {
      await verifyFolder(filename,process.env.SOURCE_PROJECT_REF);
      console.log('PASS: backup files, source manifest and checksums verified. This is not a restore drill.');
    } else if (command==='hash') {
      fs.writeFileSync(filename+'.sha256',await sha256(filename)+'\n',{mode:0o600});
      console.log('Archive SHA-256: '+await sha256(filename));
    } else if (command==='verify-hash') {
      const expected=fs.readFileSync(filename+'.sha256','utf8').trim();
      if (!/^[0-9a-f]{64}$/.test(expected) || expected!==await sha256(filename)) throw Error('Archive SHA-256 mismatch');
      console.log('PASS: archive SHA-256 verified.');
    } else if (command==='verify-binding') {
      if (!process.argv[4]) throw Error('A matching archive is required');
      await verifyBinding(filename,process.argv[4]);
      console.log('PASS: backup folder matches the archive payload.');
    } else throw Error('Unknown archive command');
  } catch(error) { console.error(error.message); process.exitCode=1; }
}
