import { pathToFileURL } from 'node:url';

export const protectedProjects = ['kymadepeuqhcsjwbrgqq', 'sgmmiymjnqqorvtvpigw'];
const refPattern = /^[a-z]{20}$/;

export function projectFromUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw Error('A valid private PostgreSQL connection URL is required'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hash || !url.password) throw Error('Incomplete PostgreSQL connection URL');
  if (url.pathname !== '/postgres') throw Error('The standard Supabase postgres database is required');
  if (url.port && url.port !== '5432') throw Error('Use a direct or session-pooler connection on port 5432');
  if (url.searchParams.has('sslmode') && !['require', 'verify-ca', 'verify-full'].includes(url.searchParams.get('sslmode'))) throw Error('A TLS-protected connection is required');
  for (const key of url.searchParams.keys()) if (key !== 'sslmode') throw Error('Unsupported connection override');
  const direct = /^db\.([a-z]{20})\.supabase\.co$/.exec(url.hostname);
  const user = decodeURIComponent(url.username);
  if (direct) {
    if (user !== 'postgres' && user !== `postgres.${direct[1]}`) throw Error('Unexpected direct connection identity');
    return direct[1];
  }
  const pooled = /^postgres\.([a-z]{20})$/.exec(user);
  if (url.hostname.endsWith('.pooler.supabase.com') && pooled) return pooled[1];
  throw Error('Unable to establish the Supabase project identity');
}

export function validateSource(url, expectedRef) {
  if (!refPattern.test(expectedRef || '') || !protectedProjects.includes(expectedRef)) throw Error('Choose one of the existing bakery databases as SOURCE_PROJECT_REF');
  if (projectFromUrl(url) !== expectedRef) throw Error('Source project identity mismatch');
  return true;
}

export function validateTarget(url, expectedRef, sourceRef) {
  if (!refPattern.test(expectedRef || '') || !protectedProjects.includes(sourceRef)) throw Error('Explicit bakery source and separate target project refs are required');
  const actual = projectFromUrl(url);
  if (protectedProjects.includes(actual) || protectedProjects.includes(expectedRef) || actual === sourceRef || expectedRef === sourceRef) throw Error('Restore blocked: both existing bakery databases are protected');
  if (actual !== expectedRef) throw Error('Target project identity mismatch');
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv[2] === 'source') validateSource(process.env.DATABASE_URL, process.env.SOURCE_PROJECT_REF);
    else if (process.argv[2] === 'target') validateTarget(process.env.TARGET_DATABASE_URL, process.env.TARGET_PROJECT_REF, process.env.SOURCE_PROJECT_REF);
    else throw Error('Usage: node connection_guard.mjs source|target');
    console.log('Connection identity accepted; no credentials are printed.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
