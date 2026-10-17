# DS Bakery Master v0.38 — staging staff access and concurrency verification

**Date:** 2026-10-17  
**Scope:** GitHub branch `ds-bakery-master-v0.38-staging`, Supabase project `kymadepeuqhcsjwbrgqq`, staging Railway only. The production project `sgmmiymjnqqorvtvpigw` was not accessed or modified.

## Test results

- **12 simultaneous database read/authorization transactions:** PASS, zero errors, using 6 pre-existing unique staff identities *twice each* (owner, manager, two cashiers, baker, stock manager). These are **not** 12 distinct authenticated browser sessions or 12 distinct staff accounts.
- **Permissions during concurrency:** owner/manager could see finance change revisions; cashiers/baker/stock manager could not. Stock manager retained inventory permission.
- **Viewer read-only:** PASS, checked approved product stock and 2 safe sync modules. Attendance clock-in/out, notification writes, profile edits and inventory permissions were denied in rollback-only staging tests.
- **First-login stale JWT boundary:** PASS, database simulation using a real existing auth session. An older session could not inherit access after completion, while a session created after the completion timestamp retained access. Tests did not change actual Auth passwords or revoke real sessions.
- **First-login service:** Edge function updated to attempt global revocation of prior refresh sessions. Still needs a real staging account's full browser-based end-to-end test.
- **Existing 6 staff profiles:** no persistent updates in tests. No fake transactions, test sales, or customer orders persisted.
- **Supabase security-advisor warnings:** privileged SECURITY DEFINER functions and leaked-password protection remain to be reviewed; not asserted resolved.

## Key staging implementation

- `supabase/staging/20261017_strict_viewer_operations.sql`
- `supabase/staging/20261017_fresh_session_after_first_login.sql`
- `supabase/functions/complete-staff-first-login/index.ts`
- `production-fixes/staging-auth-no-loop.ts`
- Repeatable rollback tests `tests/staging-strict-viewer-security.sql` and `tests/staging-first-login-session-boundary.sql`.

## Acceptance gaps

A **12-or-more distinct-account sign-in/Realtime E2E test** remains required. It needs real owner-authorized temporary staging accounts and a browser-based multi-user runner; a SQL authorization simulation cannot replace actual Auth or frontend Realtime testing.

Further recommended checks: actual staff first-login password-change lifecycle, owner suspension and session revocation, permissions after role change, realtime subscription reconnect behavior, and concurrent editing of the same inventory/product/order record. Keep production cutover locked pending explicit approval.
