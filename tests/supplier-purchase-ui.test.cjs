const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');

const source = path.resolve(__dirname, '../production-fixes');
const money = n => `UGX ${Number(n).toLocaleString('en-US')}`;
function text(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(text).join(' ').replace(/\s+/g, ' ').trim();
  if (typeof node !== 'object') return String(node);
  return text(node.props?.children);
}
function find(node, predicate, found = []) {
  if (Array.isArray(node)) node.forEach(n => find(n, predicate, found));
  else if (node && typeof node === 'object') {
    if (predicate(node)) found.push(node);
    find(node.props?.children, predicate, found);
  }
  return found;
}
const button = (tree, label) => find(tree, n => n.type === 'button' && text(n) === label)[0];
function load(filename, mocks) {
  const code = ts.transpileModule(fs.readFileSync(path.join(source, filename), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const module = { exports: {} };
  const context = { module, exports: module.exports, console, crypto: globalThis.crypto,
    require: name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), window: globalThis.window };
  vm.runInNewContext(code, context, { filename });
  return module.exports.default;
}
function harness(filename, props, client) {
  const slots = [];
  let cursor = 0, pending = [], refreshes = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const hooks = { ...React,
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => slots[i] = typeof value === 'function' ? value(slots[i]) : value];
    },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useMemo(fn, deps) {
      const i = cursor++;
      if (!same(slots[i]?.deps, deps)) slots[i] = { deps, value: fn() };
      return slots[i].value;
    },
    useCallback(fn, deps) { return hooks.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!same(slots[i], deps)) { slots[i] = deps; pending.push(fn); }
    }
  };
  const component = load(filename, {
    react: hooks, 'next/navigation': { useRouter: () => ({ refresh: () => refreshes++ }) },
    '@/lib/supabase/client': { createClient: () => client }, '@/lib/costing': { ugx: money }
  });
  return {
    render(next = props) { props = next; cursor = 0; return component(props); },
    async effects() { const effects = pending; pending = []; effects.forEach(fn => fn()); await new Promise(setImmediate); },
    get refreshes() { return refreshes; }
  };
}

async function main() {
  let prompts = [], promptCount = 0;
  globalThis.window = { prompt: () => { promptCount++; return prompts.shift() ?? null; }, confirm: () => true };
  let rows = [{ id: 'payment-1', purchase_id: 'po-1', amount: 50000, method: 'bank', reference: 'PAY-1',
    paid_at: '2026-10-05T20:19:00Z', voided_at: null, purchases: { purchase_no: 'PO-1', suppliers: { name: 'Supplier' } } }];
  const calls = [];
  const client = {
    from() { const query = { select: () => query, order: () => query, limit: async () => ({ data: rows.map(r => ({ ...r })), error: null }) }; return query; },
    async rpc(name, params) {
      calls.push({ name, params });
      const row = rows.find(r => r.id === params.p_payment_id);
      if (name === 'void_supplier_payment') Object.assign(row, { voided_original_amount: row.amount, amount: 0, voided_at: '2026-10-06T08:00:00Z' });
      if (name === 'restore_supplier_payment') Object.assign(row, { amount: row.voided_original_amount, voided_original_amount: null, voided_at: null });
      if (name === 'edit_supplier_payment') Object.assign(row, { amount: params.p_amount, reference: params.p_reference });
      return { error: null };
    }
  };
  const props = { live: true, canCorrect: true, operationsAllowed: true, operationsReason: 'Enabled', refreshKey: 'initial' };
  const ui = harness('SupplierPaymentCorrections.tsx', props, client);
  ui.render(); await ui.effects();
  let tree = ui.render();
  assert(button(tree, 'Edit') && button(tree, 'Delete / Void'), 'Authorized active payment shows correction controls');
  prompts = ['Staging void test'];
  await button(tree, 'Delete / Void').props.onClick();
  tree = ui.render();
  assert.equal(ui.refreshes, 1, 'Void refreshes account totals and statement');
  assert.equal(calls.at(-1).name, 'void_supplier_payment');
  assert(button(tree, 'Restore'), 'Voided payment shows Restore');
  assert(!button(tree, 'Edit'), 'Voided payment cannot be edited');
  const dataRow = find(tree, n => n.type === 'tr' && find(n, child => child.type === 'td').length === 8)[0];
  const amountCell = find(dataRow, n => n.type === 'td')[3];
  assert.equal(text(find(amountCell, n => n.type === 'b')[0]), 'UGX 0', 'Voided effective amount is zero');
  assert(text(amountCell).includes('Original: UGX 50,000'), 'Original amount remains visible for restore');
  prompts = ['Staging restore test'];
  await button(tree, 'Restore').props.onClick();
  tree = ui.render();
  assert.equal(ui.refreshes, 2, 'Restore refreshes account totals and statement');
  assert.equal(rows[0].amount, 50000);
  prompts = ['60000', 'bank', 'PAY-EDIT', 'Staging correction test'];
  await button(tree, 'Edit').props.onClick();
  assert.equal(ui.refreshes, 3, 'Edit refreshes account totals and statement');
  assert.equal(rows[0].amount, 60000);
  rows.push({ ...rows[0], id: 'payment-2', reference: 'NEW-EXTERNAL-PAYMENT' });
  ui.render({ ...props, refreshKey: 'changed-statement' }); await ui.effects();
  assert(text(ui.render()).includes('NEW-EXTERNAL-PAYMENT'), 'New payments reload when the server statement changes');

  const locked = harness('SupplierPaymentCorrections.tsx', { ...props, operationsAllowed: false, operationsReason: 'Production Lock is on' }, client);
  locked.render(); await locked.effects(); tree = locked.render();
  assert(button(tree, 'Edit').props.disabled && button(tree, 'Delete / Void').props.disabled);
  const beforeCalls = calls.length, beforePrompts = promptCount;
  await button(tree, 'Delete / Void').props.onClick();
  assert.equal(calls.length, beforeCalls, 'Locked correction never calls the database');
  assert.equal(promptCount, beforePrompts, 'Locked correction never opens a mutation prompt');
  const denied = harness('SupplierPaymentCorrections.tsx', { ...props, canCorrect: false }, client);
  denied.render(); await denied.effects(); tree = denied.render();
  assert(!button(tree, 'Edit') && !button(tree, 'Delete / Void') && !button(tree, 'Restore'), 'Correction controls are hidden without permission');

  const receiptLine = { id: 'line-1', purchase_no: 'PO-1', material_name: 'Flour', base_unit: 'kg', ordered_qty_base: 25, received_qty_base: 0, remaining_qty_base: 25, unit_cost_base: 4000 };
  const receiptProps = { lines: [receiptLine], history: [receiptLine, { ...receiptLine, id: 'line-2', base_unit: 'L', ordered_qty_base: 10, remaining_qty_base: 10 }], live: true, operationsAllowed: false, operationsReason: 'Production Lock is on' };
  const receipt = harness('PurchaseReceivingPanel.tsx', receiptProps, client);
  tree = receipt.render();
  assert(text(tree).includes('25 kg') && text(tree).includes('10 L'), 'Different receipt units remain separate');
  assert(button(tree, 'Receive').props.disabled, 'Locked stock receipt is disabled');
  await button(tree, 'Receive').props.onClick();
  assert.equal(calls.length, beforeCalls, 'Locked stock receipt never calls the database');

  const receivedPurchase = { id: 'po-1', purchase_no: 'PO-1', purchase_date: '2026-10-05', status: 'received', approval_status: 'approved', supplier_id: 'supplier-1', suppliers: { name: 'Supplier' }, purchase_items: [{ ...receiptLine, raw_material_id: 'material-1', received_qty_base: 25, raw_materials: { name: 'Flour', base_unit: 'kg' } }] };
  const filters = [];
  const serverClient = {
    from(table) {
      filters.push(['from', table]);
      const q = { select: () => q, eq: (...args) => { filters.push(['eq', ...args]); return q; },
        in: (...args) => { filters.push(['in', ...args]); return q; }, order: () => q,
        limit: async () => ({ data: [receivedPurchase], error: null }) };
      return q;
    }, rpc: async () => ({ data: { allowed: false, reason: 'Production Lock is on' }, error: null })
  };
  const page = load('purchases-page.tsx', {
    '@/components/Sidebar': { default: () => null }, '@/components/operations/PurchaseReceivingPanel': { default: 'ReceivingPanel' },
    '@/lib/auth': { requireStaff: async () => ({ profile: { role: 'owner' } }) }, '@/lib/supabase/server': { createClient: async () => serverClient },
    '@/lib/repositories/operationsLive': { getPurchaseReceivingData: async () => ({ demo: false, lines: [] }) }
  });
  tree = await page();
  let panel = find(tree, n => n.type === 'ReceivingPanel')[0];
  assert.equal(panel.props.history.length, 1, 'Fully received purchase remains in receipt history');
  assert.equal(panel.props.history[0].remaining_qty_base, 0);
  assert.equal(panel.props.history[0].material_name, 'Flour');
  assert.equal(panel.props.operationsAllowed, false);
  assert(filters.find(f => f[0] === 'in')[2].includes('received'));
  serverClient.rpc = async () => ({ data: null, error: { message: 'Status unavailable' } });
  tree = await page(); panel = find(tree, n => n.type === 'ReceivingPanel')[0];
  assert.equal(panel.props.operationsAllowed, false, 'Missing operation status fails closed');
  console.log('PASS: Edit/Void/Restore refresh; voided effective amount; statement reload; permission and production lock controls; separate units; completed receipt history; fail-closed operation status.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
