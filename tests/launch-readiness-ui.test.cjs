const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const source = path.resolve(__dirname, '../production-fixes');

function load(filename, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(source, filename), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, console, process,
    require: name => Object.hasOwn(mocks, name) ? mocks[name] : require(name) }, { filename });
  return module.exports;
}
const helper = load('launchReadiness.ts');
const check = (check_key, status, detail = check_key) => ({ check_key, status, detail });
const locked = {
  environment_mode: 'production', database_gate: 'fail', production_lock: true, operations_enabled: false,
  go_live_setup: { setup_completed: false },
  database_checks: [check('active_owner', 'pass'), check('negative_inventory', 'pass'), check('purchase_totals', 'pass'),
    check('go_live_setup', 'fail', 'Production mode requires completed go-live setup'),
    check('production_lock', 'pass', 'Production Lock is enabled'),
    check('production_operations', 'fail', 'Live business operations are not authorized')]
};
const display = helper.getReadinessDisplay(locked);
assert.equal(display.integrityLabel, 'PASS');
assert.equal(display.integrityFailures, 0);
assert.equal(display.launchLabel, 'LOCKED');
assert.equal(helper.launchControlLabel(locked.database_checks[3], locked), 'INCOMPLETE');
assert.equal(helper.launchControlLabel(locked.database_checks[5], locked), 'DISABLED');

const broken = { ...locked, database_checks: locked.database_checks.map(c => c.check_key === 'negative_inventory' ? check(c.check_key, 'fail', 'Negative stock detected') : c) };
assert.equal(helper.getReadinessDisplay(broken).integrityLabel, 'FAIL', 'A real integrity failure remains visible while launch is locked');
assert.equal(helper.getReadinessDisplay(broken).launchLabel, 'BLOCKED');
assert.equal(helper.getReadinessDisplay({ ...locked, production_lock: false }).launchLabel, 'BLOCKED', 'Missing production protection is not an expected lock');
assert.equal(helper.getReadinessDisplay(locked, true).integrityLabel, 'UNAVAILABLE', 'RPC failure cannot display a pass');
assert.equal(helper.getReadinessDisplay({}, true).launchLabel, 'UNAVAILABLE');
assert.equal(helper.getReadinessDisplay({}).integrityLabel, 'PENDING', 'Empty evidence cannot display a pass');
assert.equal(helper.getReadinessDisplay({ ...locked, database_checks: [check('negative_inventory', 'pending')] }).integrityLabel, 'PENDING');
assert.equal(helper.getReadinessDisplay({ ...locked, environment_mode: 'staging', production_lock: false }).launchLabel, 'STAGING');
const ready = { ...locked, database_gate: 'pass', operations_enabled: true, go_live_setup: { setup_completed: true }, database_checks: locked.database_checks.map(c => ({ ...c, status: 'pass' })) };
assert.equal(helper.getReadinessDisplay(ready).launchLabel, 'READY');
assert.equal(helper.getReadinessDisplay({ ...ready, database_checks: ready.database_checks.filter(c => c.check_key !== 'production_operations') }).launchLabel, 'PENDING', 'Incomplete launch evidence cannot display ready');

async function pageMarkup(filename, launch, error = null, environment = 'production') {
  const page = load(filename, {
    'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
    '@/components/Sidebar': { default: () => React.createElement('nav') },
    '@/lib/integration/launchReadiness': helper,
    '@/lib/auth': { requireStaff: async () => {} },
    '@/lib/access': { requirePermission: async () => {} },
    '@/lib/runtime': { deploymentEnvironment: () => 'production', runtimeMode: () => 'live' },
    '@/lib/costing': { ugx: value => `UGX ${value}` },
    '@/lib/integration/health': { getSystemHealth: async () => ({ mode: 'live', environment, checks: [] }) },
    '@/lib/repositories/reports': { getOwnerDashboard: async () => ({ summary: [], bestSellers: [], lowStock: [], recentActivity: [] }) },
    '@/lib/supabase/server': { createClient: async () => ({ rpc: async name => name === 'launch_readiness_summary' ? { data: launch, error } : { data: {}, error: null } }) }
  }).default;
  return renderToStaticMarkup(await page());
}
async function main() {
  for (const filename of ['dashboard-page.tsx', 'system-status-page.tsx']) {
    const html = await pageMarkup(filename, locked);
    assert(html.includes('Database integrity') && html.includes('PASS'), `${filename} shows passing database checks`);
    assert(html.includes('Production launch') && html.includes('LOCKED'), `${filename} explains the disabled launch`);
    assert(!html.includes('Database gate'), `${filename} removes the ambiguous gate label`);
    const failure = await pageMarkup(filename, broken);
    assert(failure.includes('FAIL') && failure.includes('BLOCKED'), `${filename} preserves real failures`);
    const unavailable = await pageMarkup(filename, null, { message: 'Network failure' });
    assert(unavailable.includes('UNAVAILABLE'), `${filename} preserves unavailable evidence`);
  }
  for (const environment of ['production', 'staging']) {
    const html = await pageMarkup('system-status-page.tsx', locked, null, environment);
    assert(html.includes(`Current ${environment} evidence`), 'System Status names the connected environment');
    assert(html.includes(`The ${environment} application is deployed`), 'Deployment description names the connected environment');
    assert(html.includes(`Railway ${environment} environment configured`), 'Deployment evidence names the connected environment');
  }
  const Panel = load('LaunchValidationPanel.tsx', { '@/lib/integration/launchReadiness': helper }).default;
  const html = renderToStaticMarkup(React.createElement(Panel, { envChecks: [], dbChecks: locked.database_checks, release: locked, demo: false }));
  assert(html.includes('PRODUCTION LOCKED') && html.includes('INCOMPLETE') && html.includes('DISABLED'));
  assert(html.includes('Production Launch Controls'));
  const integritySection = html.split('Database Integrity')[1].split('Production Launch Controls')[0];
  assert(!integritySection.includes('go live setup') && !integritySection.includes('production operations'), 'Launch blockers are not listed as database integrity failures');
  const brokenHtml = renderToStaticMarkup(React.createElement(Panel, { envChecks: [], dbChecks: broken.database_checks, release: broken, demo: false }));
  assert(brokenHtml.includes('BLOCKED') && brokenHtml.includes('Negative stock detected'));
  console.log('PASS: locked launch, genuine failures, missing evidence, and all three readiness screens');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
