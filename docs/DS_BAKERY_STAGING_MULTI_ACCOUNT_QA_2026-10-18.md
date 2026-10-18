# DS Bakery v0.38 — Multi-account staging validation
**18 October 2026 — Staging only; no production deployment or production database changes**

## Verified database and rollback tests

| Test | Result | Evidence |
|---|---|---|
| Role access for owner, manager, cashier, baker, storekeeper | PASS | Five separate authenticated-role SQL simulations |
| View-only role | PASS | One cashier temporarily made viewer in a rollback test; viewer has no mutation grants |
| Unauthorized POS / cash / purchase / stock / payroll | PASS | `tests/staging-six-role-account-isolation.sql` |
| Two distinct cashiers sell from the same finished stock | PASS | `tests/staging-two-cashier-shared-data-e2e.sql` |
| Sales attribution | PASS | Each saved sale linked to its own cashier_id and audit actor_id |
| Shared finished stock | PASS | 10 units -> 8 after two simulated sales |
| Payment total | PASS | UGX 5,000 + UGX 5,000 = UGX 10,000 |
| Owner and manager cross-account sales access | PASS | Both can see the same two transactions |
| Transaction notifications with correct cashier names | PASS | Two events, four recipient notices (CEO and manager) |
| Owner disables/re-enables staff; other cashier unaffected | PASS | `tests/staging-two-account-lifecycle.sql` |
| Owner changes a cashier role to baker; POS then denied | PASS | `tests/staging-two-account-lifecycle.sql` |
| Suspended cashier blocked from sensitive management functions | PASS | `tests/staging-suspended-sensitive-rpc-isolation.sql` |
| Existing POS, sales sync, customer commerce and first-login boundary | PASS | Individual rollback SQL test files |

**All test transactions were rolled back.** The six existing profiles remain enabled, and their real passwords were not changed. As of test completion, staging has 1 owner, 1 manager, 2 cashiers, 1 baker, and 1 storekeeper; no persistent viewer profile. 

## Critical issue found and fixed

PostgreSQL evaluates `NULL NOT IN (...)` and `NULL <> 'owner'` as UNKNOWN rather than TRUE. In `IF` checks this can allow a disabled staff account with no current role past the first authorizer guard. We fixed the affected role allowlists and comparisons in **staging**, preserving 81 original function definitions in a non-exposed, restricted `ds_qa_internal` schema. Nine transaction-level regression suites were rerun successfully after the correction. This is **not** a full security certification; Supabase security advisers still flag privileged functions and leaked-password protection for further review.

## Real device and authenticated sign-in acceptance tests still required

Database JWT-subject simulation is **not** equivalent to a signed-in browser or a real-time subscription. Staff must exercise the following manual staging-only workflow; do not share passwords in ChatGPT.

1. **CEO** opens staging in a normal desktop browser, signs in, and goes to **Staff & Roles**. Create distinct *staging-only* test accounts with unique test-controlled email addresses and temporary passwords (12+ characters). Don't change permanent employee passwords. Use role `cashier` twice, `manager`, `baker`, `storekeeper`, and `viewer` as needed. Existing staff may be used with their explicit involvement.
2. Each test staff member signs in using a **different browser profile, incognito session or separate device** to prevent browser cookie/session crossover. Complete mandatory first-login password replacement; then sign in again. **Do not send passwords or temporary credentials to the assistant.**
3. **Cashier A** opens a shift and records a small, clearly labeled staging test sale for a staging QA product with available finished stock. Capture order/sale reference (not personal customer data).
4. **Cashier B** records a second independent staging sale with their own shift. Verify both receipts attribute the correct cashier, and finished stock falls once per sale.
5. **Manager/CEO** refresh the sales/dashboard and check the **🔔 Notifications** and notification history. Both cashier names/roles should be correct and no duplicated notices should appear. Verify Realtime updates without refresh; test reconnect after switching Wi-Fi/mobile data.
6. **Baker** opens production tasks and confirms only authorized production steps; verify unauthorized finance and staff-management actions are inaccessible and rejected.
7. **Stock Manager** records a test stock receipt and verifies it appears to the authorized manager while sensitive payroll records remain unavailable.
8. **View-Only Staff** sees limited product/stock quantities but cannot create/alter sales, payroll, attendance, or staff profiles, even by calling database endpoints.
9. **CEO** disables one disposable test staff account; its existing session should lose protected access. Other staff continue normally. Re-enable and check login/permission flow.
10. Test **customer browsing and authenticated checkout** with a separate staging test customer, no real customer contact details and no real payments.
11. Review audit trail, account attribution, notification time (East Africa Time), stock and finance totals. Remove or formally void persistent test-only transactions with reasons before launch; do not secretly erase audit history.

### Reporting format

Mark each test **PASS / FAIL / NOT TESTED**, along with the role, device/browser, the affected page, approximate local time, and redacted screenshot. Never include passwords, access tokens, payment references, real customer phone numbers, or personal customer details in reports.

### Device DNS blocker

Earlier mobile screenshots showed `DNS_PROBE_FINISHED_NXDOMAIN` on Railway-generated domains. Laptop access works. Independent mobile access is still **not verified**; use separate desktop browser profiles first, then resume Android/iOS/mobile-data testing when the public hostname resolves.

### Next milestone

Full authenticated first-login and **6+ real independent account sessions** from distinct browsers/devices, not only database impersonation, plus a concurrent edit conflict test. No automatic store launch or production cutover occurs before explicit approval.
