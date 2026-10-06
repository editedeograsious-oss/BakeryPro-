import fs from 'node:fs';
import path from 'node:path';
import {createCipheriv,createDecipheriv,pbkdf2Sync,randomBytes} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import {pathToFileURL} from 'node:url';

const magic=Buffer.from('DSBAKERY-RECOVERY-1\n');
const saltBytes=16,ivBytes=12,tagBytes=16,iterations=600000;
const headerBytes=magic.length+saltBytes+ivBytes;

export function checkPassphrase(passphrase) {
  if(typeof passphrase!=='string'||passphrase.length<32) throw Error('Use a private backup passphrase of at least 32 characters');
}

function key(passphrase,salt) {
  checkPassphrase(passphrase);
  return pbkdf2Sync(passphrase,salt,iterations,32,'sha256');
}

export async function encryptBundle(input,output,passphrase) {
  checkPassphrase(passphrase);
  const salt=randomBytes(saltBytes),iv=randomBytes(ivBytes);
  const header=Buffer.concat([magic,salt,iv]);
  const cipher=createCipheriv('aes-256-gcm',key(passphrase,salt),iv);
  cipher.setAAD(header);
  fs.writeFileSync(output,header,{flag:'wx',mode:0o600});
  try {
    await pipeline(fs.createReadStream(input),cipher,fs.createWriteStream(output,{flags:'a',mode:0o600}));
    fs.appendFileSync(output,cipher.getAuthTag());
  } catch(error) {fs.rmSync(output,{force:true});throw error;}
}

export async function decryptBundle(input,output,passphrase) {
  checkPassphrase(passphrase);
  if(fs.existsSync(output)) throw Error('Choose a new output file');
  const length=fs.statSync(input).size;
  if(length<headerBytes+tagBytes) throw Error('Invalid encrypted recovery bundle');
  const fd=fs.openSync(input,'r'),header=Buffer.alloc(headerBytes),tag=Buffer.alloc(tagBytes);
  try {fs.readSync(fd,header,0,header.length,0);fs.readSync(fd,tag,0,tag.length,length-tagBytes);} finally {fs.closeSync(fd);}
  if(!header.subarray(0,magic.length).equals(magic)) throw Error('Invalid encrypted recovery bundle');
  const salt=header.subarray(magic.length,magic.length+saltBytes),iv=header.subarray(magic.length+saltBytes);
  const decipher=createDecipheriv('aes-256-gcm',key(passphrase,salt),iv);
  decipher.setAAD(header);decipher.setAuthTag(tag);
  const temporary=path.join(path.dirname(path.resolve(output)),'.ds-bakery-decrypt-'+randomBytes(12).toString('hex'));
  try {
    const ciphertext=length===headerBytes+tagBytes?Readable.from([]):fs.createReadStream(input,{start:headerBytes,end:length-tagBytes-1});
    await pipeline(ciphertext,decipher,fs.createWriteStream(temporary,{flags:'wx',mode:0o600}));
    // Link rather than overwrite another file that may have appeared during decryption.
    fs.linkSync(temporary,output);
  } finally {fs.rmSync(temporary,{force:true});}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const [operation,input,output]=process.argv.slice(2);
    if(!input||!output||!['encrypt','decrypt'].includes(operation)) throw Error('Usage: node encrypted_bundle.mjs encrypt|decrypt <input> <new-output>');
    await (operation==='encrypt'?encryptBundle:decryptBundle)(input,output,process.env.BACKUP_ENCRYPTION_PASSPHRASE);
    console.log('Recovery bundle operation completed. No passphrase is printed.');
  } catch {console.error('Recovery bundle operation failed. Check the private passphrase, input and output paths.');process.exitCode=1;}
}
