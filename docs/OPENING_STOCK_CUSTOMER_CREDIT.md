# Opening stock and existing customer debts

This v0.38 change adds `/opening-balances` for active Owners and Managers.

Opening raw materials, finished goods and customer debts are saved as **unposted drafts**. Drafts never enter live inventory, finished goods batches, credit allocations, sales, cash or profit. There is no posting or cutover action on this screen. Production Lock stays on and operations stay off. Actual opening posting and final cutover still require the Owner's explicit approval and a reviewed import.

One draft per stock item or customer prevents duplicate opening records. Identical request retries return the existing draft; changed requests, stale edits, invalid amounts and fractional finished goods are rejected. Edit, Void and Restore retain an audit trail. Voided entries are excluded from draft totals. Drafts close after setup completion or any authorized cutover. Active unposted drafts block go-live completion.

Register materials/products and customer profiles before selecting them in the opening screen. Record stock in its base unit and use cost rather than selling price. Record only the amount still owed after earlier customer payments; preparing an old debt does not enable new credit. New supplier deliveries use Purchases and Receiving, separately from the opening snapshot, once operations are explicitly approved.

The Customers page now shows order debt, Credit Book debt and the combined amount separately. The original order-only view fields remain compatible with other modules. Restricted credit balances are not disclosed. Individual credit-read restrictions also hide opening debts and block their preparation; denied inventory-write access blocks draft edits while preserving authorized stock viewing. Raw-material viewing follows the installed role rules, since the database catalogue has no `inventory:read` key. Credit repayments and corrections now obey the normal operation gate at both credit ledger and allocation tables. A separate migration brings staging's repayment-void constraint into line with production.

## Validation

- `tests/staging-opening-balances.sql`: transactional staging test of draft creation/retry, duplicate rejection, edit/version conflict, void/restore, permissions, direct-write denial, unchanged live stock/finance, Customers/Credit Book agreement through payment void/restore, prelaunch draft entry while locked, blocked live credit transactions and frozen drafts after setup. All fixtures roll back.
- `tests/opening-balances-ui.test.cjs`: stock/debt field separation, corrections, voided draft totals, permission/closed-state controls, correct customer totals and locked repayment controls.
- Existing supplier-purchase and launch-readiness UI checks passed.
- `npm run release:check` passed: structure, current v0.38 validator, syntax, types and production build.
- The validation script now recognizes v0.38 and checks the authenticated Edge Function staff route boundary already used by production.

Production deployment `e4e22700-32c5-45e2-b109-a4d32c17cde2` is SUCCESS for commit `8e66b0d66992ef2cac2349a0052846e9e8df1768`. Stock, financial totals and business record counts match the before-change snapshot. Production Lock remains on, setup incomplete and operations off. Staging deployment `9b5b659f-35c1-44bd-b307-a9f0044da5d2` is SUCCESS for commit `bc7f256c509a9ade209c519377771008b6d1f23f`. Its staff invitation client forwards the authenticated session to the existing Edge Function proxy. No invitation was sent as part of validation. Production `/api/health` returned 200 with a passing database check, and the browser bundle targets the production Supabase project exclusively. No actual business rows have been supplied or imported yet. SMTP delivery verification remains pending from the previous task. Refresh the database backup after the opening import and before an approved cutover.

## Information to collect privately

Use one agreed opening date. Do not commit real customer contacts, debts, invoices or credentials to this public repository.

| List | Required information |
| --- | --- |
| Existing stock | Raw material or finished product, name, physical quantity, base unit, cost per base unit, opening date; batch reference if known |
| New deliveries | Supplier, delivery/invoice date, material, quantity and unit, unit cost, amount paid, remaining supplier debt, invoice/reference |
| Existing credit customers | Name, phone if available, amount still owed in UGX, opening date, original due date/reference if known |
| Other opening information | Supplier debts, cash/mobile money/bank balances, current prices and recipes, staff roles, business contacts and opening hours |

The production audit found zero customer profiles, only a TEST-named active raw material and supplier, and no opening hours. The product `Lemons 1k` has no recipe; confirm its intended category and cost before filling that gap. Only the Owner account is active, so confirm whether other staff require access. Existing checklist flags do not substitute for confirming the actual bakery data.
