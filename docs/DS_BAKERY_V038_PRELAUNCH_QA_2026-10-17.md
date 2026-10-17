# DS Bakery v0.38 — Pre-launch QA audit (STAGING ONLY)
Date: 17 October 2026
Project: staging Supabase `kymadepeuqhcsjwbrgqq`, staging Railway `41e5e778-ce40-4390-8814-133d179d92f7`
GitHub tested release: `c6a1c53ef3326f6ea4d7c19e3798901c21982a9a`
Production remains unchanged. No new user accounts, test purchases, stock postings or fake business content were persisted.

## QA result summary
- **29/29 automated Node/UI/build checks PASSED** on Railway (prior staged SEO release).
- **14/14 existing staging-only rollback SQL regressions PASSED** (this audit session):
  1. Customer verified login and checkout
  2. Purchase workflow, receipt, supplier payment/adjustment
  3. Payroll financial consistency and missing advance guard
  4. Zero-debt credit repayment denied
  5. Backup role-based access guards
  6. Transaction alerts: named staff, CEO privacy, idempotent notices
  7. Manual finished-stock POS allocation
  8. Opening balances, draft corrections, credit and lock gates
  9. Owner-only manual finished-goods stock
  10. POS cross-role, cash/stock, idempotence
  11. POS saved-sale dashboard figures
  12. Customer commerce, reviews, stock and login restrictions
  13. Strict view-only read/write isolation
  14. First-password-change stale-session isolation
- **85/85 public data tables** have RLS enabled.
- Last Railway staging status: **online, one running instance, zero crashes, no current warnings or critical alerts**.
- The database readiness function returned **0 integrity failures and 3 warnings** (not launch approval).

## Confirmed launch blockers
1. **Public web DNS:** User's Android screenshots repeatedly showed `DNS_PROBE_FINISHED_NXDOMAIN` at `*.up.railway.app`. The public `/shop` and `/api/health` endpoints could not be independently fetched. A working public HTTPS domain and mobile network/browser verification are compulsory. No domain purchase is requested yet.
2. **Empty customer catalogue:** Authenticated-as-`anon` simulation of `public_product_catalog()` returned **0** publicly visible products. There are three product records, two active, but no active, online-published product; the shop cannot serve real buyers yet. Real product names, prices, photos and publishing are needed.
3. **Staging placeholder content:** `launch_readiness_summary()` reported **9 placeholders** (including generic staff records), with `clear_for_production=false`. Replace and approve them before go-live.
4. **Recipe/data completeness:** readiness reports **1 active product with missing recipe coverage**. Verify production and ingredient costing with real batch data.
5. **Manual go-live prerequisites:** manual flags `catalog_verified`, `opening_stock_verified`, `public_site_verified`, `staff_accounts_verified`, `backup_plan_verified` are **false**. Payment methods have been marked verified **in staging only**.
6. **Real-world acceptance tests missing:** No complete hands-on mobile-browser owner/cashier/shop testing across different networks; 12 separate staff simultaneous sign-ins; physical-device RealTime confirmations; live failed-network recovery and staff password lifecycle.
7. **Security advisor warnings remain:** 5 anon-privileged and 156 authenticated SECURITY DEFINER exposure warnings require targeted function-by-function review (some legitimate), and leaked-password protection is reported disabled. These are warnings, not proof of exploitation.
8. **App stores:** Android project archive exists but signed release Android bundle and iOS native build not verified. Not yet publishable.

## Staging functional coverage / acceptance plan
| Module | Database rollback test | Real device test |
|---|---|---|
| Owner and staff sign-ins, 5+ roles | Pass | Pending |
| Cashier POS, money and stock deduction | Pass | Pending |
| Purchases and supplier balances | Pass | Pending |
| Raw and finished goods | Pass | Pending |
| Customer shop and order submissions | Pass | Blocked by empty catalogue/public DNS |
| Notification attribution and CEO privacy | Pass | Pending multi-account push |
| Opening balances and payroll safeguards | Pass | Pending |
| Live dashboard cross-device sync | Regression test passed | Pending |
| Mobile domain DNS / public HTTPS | Not testable in DB | Failed in user screenshots |
| Multiple independent staff devices | 12 concurrent DB requests only | Pending distinct sign-ins |
| Backup-restore drill | Mocked automated tests | Actual isolated restore pending |

## Required before production release
1. Resolve public DNS and test `/shop` and `/api/health` from Android mobile data, Wi-Fi and another independent network.
2. Populate and publish **actual** customer catalogue, image assets and prices. Perform a customer order flow end to end with an authorized staff member and a verified customer test account, including cancel/refund.
3. Validate real starting stock, costs/recipes, suppliers and customer debt; correct all placeholders.
4. Verify 10–12 separate authenticated staff sessions, role gates, realtime cross-device updates, and edit-conflict handling.
5. Complete documented staging backup/export and test restore on an isolated scratch project, password policy review and targeted function permissions.
6. Complete owner sign-off for the go-live checklist and only then consider production unlock and public indexing/store builds. Do not bypass any release gate.

## Notes
The database `public_ordering_status()` returns `true` for staging to support rollback-only test fixtures, even with an empty public catalogue; this is not evidence that the bakery is open to real customers. The public shop renders an empty catalogue until products are published. The recorded deployment-readiness `staging_url` references the earlier deleted v035 hostname and should not be used as a live-accessibility verification. Avoid manually marking `public_site_verified=true` until a real HTTP/browser test passes.
