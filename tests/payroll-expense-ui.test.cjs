const assert = require('node:assert/strict');
const { harness, load, text, find, button } = require('./ui-harness.cjs');

async function main() {
  let prompts = [], promptCount = 0;
  globalThis.window = { prompt: () => { promptCount++; return prompts.shift() ?? null; }, confirm: () => true };
  const calls = [];
  let response = { data: 'existing-id', error: null };
  const client = { async rpc(name, args) { calls.push({ name, args }); return response; } };
  const paid = { id: 'nov', staff_id: 'staff', payroll_month: '2026-11-01', full_name: 'Cashier', role: 'cashier',
    basic_salary: 300000, allowances: 25000, deductions: 10000, advance_deduction: 30000,
    net_pay: 285000, gross_pay: 325000, payment_status: 'paid', advance_history_ready: true };
  const props = { staff: [{ id: 'inactive', full_name: 'Disabled Staff', active: false }, { id: 'staff', full_name: 'Cashier', active: true }],
    compensation: [{ staff_id: 'staff', basic_salary: 300000, effective_from: '2026-10-01' }], runs: [], items: [paid], advances: [],
    live: true, canCorrect: true, canManage: true, operationsAllowed: true };

  const locked = harness('PayrollManager.tsx', { ...props, operationsAllowed: false, operationsReason: 'Go-Live Setup is not complete' }, client);
  let tree = locked.render();
  for (const label of ['Record Advance', 'Generate Payroll', 'Reverse']) assert(button(tree, label).props.disabled);
  assert(!button(tree, 'Save Salary Setup').props.disabled, 'Salary setup is available while transactions are locked');
  assert(!text(tree).includes('Disabled Staff'), 'Inactive staff cannot be selected for new salary setup or advances');
  const beforePrompts = promptCount;
  await button(tree, 'Reverse').props.onClick();
  assert.equal(calls.length, 0);
  assert.equal(promptCount, beforePrompts);
  await button(tree, 'Save Salary Setup').props.onClick();
  assert.equal(calls.at(-1).name, 'save_staff_compensation');
  assert.equal(calls.at(-1).args.p_staff_id, 'staff');
  assert.equal(locked.refreshes, 1);

  const failClosed = harness('PayrollManager.tsx', { ...props, operationsAllowed: undefined, canManage: undefined }, client);
  tree = failClosed.render();
  assert(button(tree, 'Save Salary Setup').props.disabled && button(tree, 'Generate Payroll').props.disabled);
  assert(!button(tree, 'Reverse'), 'Correction controls require payroll management and correction permissions');
  const noCorrection = harness('PayrollManager.tsx', { ...props, canCorrect: false }, client);
  assert(!button(noCorrection.render(), 'Reverse'));
  const legacy = harness('PayrollManager.tsx', { ...props, items: [{ ...paid, advance_history_ready: false }] }, client);
  tree = legacy.render();
  assert(button(tree, 'Reverse').props.disabled);
  assert(text(tree).includes('Advance allocation history needs review'));
  await button(tree, 'Reverse').props.onClick();
  assert.equal(calls.length, 1, 'Missing advance history never calls a correction RPC');

  const salary = harness('PayrollManager.tsx', props, client);
  prompts = ['Staging reversal'];
  await button(salary.render(), 'Reverse').props.onClick();
  assert.equal(calls.at(-1).name, 'reverse_payroll_payment');
  assert.equal(salary.refreshes, 1);
  tree = salary.render({ ...props, items: [{ ...paid, payment_status: 'void' }] });
  assert(text(tree).includes('Active salary payments: UGX 0'));
  assert(text(tree).includes('Paid: UGX 0'));
  assert(button(tree, 'Restore') && button(tree, 'Reopen for Correction'));
  prompts = ['Staging restore'];
  await button(tree, 'Restore').props.onClick();
  assert.equal(calls.at(-1).name, 'restore_payroll_payment');
  assert.equal(salary.refreshes, 2);

  const unpaid = harness('PayrollManager.tsx', { ...props, items: [{ ...paid, payment_status: 'unpaid' }] }, client);
  const count = calls.length;
  prompts = ['Infinity', '10000', '30000', 'Invalid adjustment'];
  await button(unpaid.render(), 'Adjust').props.onClick();
  assert.equal(calls.length, count, 'Non-finite adjustments never reach the database');
  response = { data: null, error: { message: 'Advance exceeds available balance' } };
  prompts = ['25000', '10000', '30000', 'Adjustment'];
  await button(unpaid.render(), 'Adjust').props.onClick();
  assert(text(unpaid.render()).includes('Advance exceeds available balance'), 'Supabase error details remain visible');
  assert.equal(unpaid.refreshes, 0);

  let resolveRequest;
  const pendingClient = { rpc(name, args) { calls.push({ name, args }); return new Promise(resolve => { resolveRequest = resolve; }); } };
  const pending = harness('PayrollManager.tsx', props, pendingClient);
  tree = pending.render();
  prompts = ['One reversal'];
  const first = button(tree, 'Reverse').props.onClick();
  const afterFirst = calls.length;
  await button(tree, 'Reverse').props.onClick();
  assert.equal(calls.length, afterFirst, 'Rapid repeated clicks make one request');
  assert(button(pending.render(), 'Reverse').props.disabled);
  resolveRequest({ data: null, error: null }); await first;
  assert.equal(pending.refreshes, 1);

  const expenseProps = { row: { id: 'expense', category: 'Payroll', amount: 285000 }, live: true, canCorrect: true,
    operationsAllowed: true, onMessage() {} };
  tree = harness('ExpenseCorrectionActions.tsx', expenseProps, client).render();
  assert.equal(find(tree, n => n.type === 'a')[0].props.href, '/payroll');
  assert(!button(tree, 'Edit') && !button(tree, 'Delete / Void') && !button(tree, 'Restore'), 'Salary corrections are routed through Payroll');
  const generic = harness('ExpenseCorrectionActions.tsx', { ...expenseProps, row: { ...expenseProps.row, category: 'Utilities' }, operationsAllowed: false }, client);
  tree = generic.render();
  assert(button(tree, 'Edit').props.disabled && button(tree, 'Delete / Void').props.disabled);
  const before = calls.length;
  await button(tree, 'Delete / Void').props.onClick();
  assert.equal(calls.length, before);

  const expenses = [
    { id: 'active', category: 'Payroll', amount: 555000, payment_method: 'bank', business_date: '2026-10-06', created_at: '2026-10-05T21:26:27Z' },
    { id: 'void', category: 'Payroll', amount: 280000, payment_method: 'bank', business_date: '2026-10-06', created_at: '2026-10-05T21:24:47Z', voided_at: '2026-10-05T21:26:15Z' }
  ];
  const expenseUi = harness('ExpenseManager.tsx', { expenses, shifts: [], live: true, canCorrect: true, operationsAllowed: false, businessDate: '2026-10-06' }, client,
    { '@/components/finance/ExpenseCorrectionActions': { default: 'Corrections' } });
  tree = expenseUi.render();
  const stats = find(tree, n => n.props?.className === 'card stat');
  assert.equal(text(stats[0]), 'Today UGX 555,000', 'Today uses the bakery business date and excludes voided expenses');
  assert.equal(text(stats[3]), 'Bank Expenses UGX 555,000');
  assert(text(tree).includes('Original: UGX 280,000'));
  assert(button(tree, 'Record Expense').props.disabled);

  const serverClient = {
    from(table) { return { select() { return this; }, async in() { return { data: table === 'payroll_items' ? [] : [{ payroll_item_id: 'nov', amount: 30000 }], error: null }; } }; },
    async rpc(name) { return { data: name === 'business_operation_status' ? null : true, error: name === 'business_operation_status' ? { message: 'Unavailable' } : null }; }
  };
  const page = load('payroll-page.tsx', {
    '@/components/Sidebar': { default: 'Sidebar' }, '@/components/finance/PayrollManager': { default: 'Payroll' },
    '@/lib/access': { requirePermission: async () => {} }, '@/lib/supabase/server': { createClient: async () => serverClient },
    '@/lib/repositories/business37': { getPayrollData: async () => ({ ...props, demo: false, items: [paid, { ...paid, id: 'oct', advance_deduction: 50000 }] }) }
  });
  tree = await page();
  const panel = find(tree, n => n.type === 'Payroll')[0];
  assert.equal(panel.props.operationsAllowed, false, 'Unavailable server operation status fails closed');
  assert.equal(panel.props.items[0].advance_history_ready, true);
  assert.equal(panel.props.items[1].advance_history_ready, false);
  console.log('PASS: Payroll and expense locks, roles, active staff, correction refresh, legacy allocation warning, finite input, Supabase errors, repeated clicks, voided totals, bank totals and business date.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
