# v0.38 formal staging connection helper

The archived application's connection helper expected v0.31 / migration 30. The maintained repository-root `staging_connection_check.mjs` expects v0.38.0 / migration 38 and supports an existing Owner through `STAGING_OWNER_EMAIL` and `STAGING_OWNER_PASSWORD`.

Before running the formal check on a trusted machine, copy this helper over `scripts/staging_connection_check.mjs` in the assembled application, then run `npm run staging:connection-check` there.

Supply `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_ANON_KEY`, `STAGING_SUPABASE_SERVICE_ROLE_KEY`, `STAGING_OWNER_EMAIL` and `STAGING_OWNER_PASSWORD` through that machine's secure environment. Never paste passwords, service keys or database connections into chat or commit them.

Use the existing staging Owner. This helper does not create users, purchases or payments. The existing legacy test-domain settings remain supported for installations that already use those accounts.

The helper has passed JavaScript syntax checking. A real credentialed run is still pending; no formal connection result was fabricated. This maintenance helper is intended for the trusted operator environment; the Railway web application does not run it.
