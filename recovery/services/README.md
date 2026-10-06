# Production service recovery checkpoint

Production database recovery passed in [run 37529519835, attempt 2](https://github.com/editedeograsious-oss/BakeryPro-/actions/runs/37529519835). The [matching encrypted archive and checksums](../cloud/production-setup.md#verified-production-evidence) were independently checked and retained before three genuine Owner evidence events were recorded. Readback confirms the production backup gate is `pass`, Production Lock is ON and operations are OFF. This checkpoint inventories service recovery requirements; no full Supabase service restore or final cutover has been performed.

## Captured service configuration

`production-service-snapshot.json` contains the non-secret inventory read from production `sgmmiymjnqqorvtvpigw`, its Storage policies, deployed function metadata/source checksums and the Railway service configuration with variable names only. It contains no connection URLs, credential values, personal user records or database dumps. Counts are the state observed during this review, not a promise that future files or settings remain unchanged.

| Component | Observed state and retained evidence |
| --- | --- |
| Edge Functions | Three ACTIVE functions: `invite-staff` v4, `create-staff-account` v2 and `manage-staff-account` v2. Exact downloaded `index.ts` source bytes are retained under `supabase-functions/`; their SHA-256 values and deployed bundle hashes are separate fields. No function was invoked or redeployed. |
| Function authorization | All three have gateway `verify_jwt=false`; their existing code validates the bearer token through Auth, then requires an active Owner profile. Recovery must preserve both this code and the recorded gateway configuration. |
| Storage | One private `custom-cake-references` bucket, zero objects, no MIME/size restriction set, and four existing object policies. Bucket configuration and policy definitions are retained. No file content existed to copy at review time. |
| Vault | Zero stored secrets. The installed Vault extension is listed in the snapshot; no encryption key was exported. |
| Realtime | `supabase_realtime` publication exists, is not all-tables and has zero member tables. |
| Scheduled database jobs | `pg_cron` is not installed; no `cron.job` relation is available. This does not establish whether external schedulers exist. |
| Auth data | Existing users use the email provider (two users). This is a user-data observation; provider, SMTP and redirect configuration were not available through the installed connector. |
| Railway | Production Dockerfile build, `/api/health` check, port 3000, one `sfo` replica, no volumes, deployed source `8cb481e37edf197787daa6d0e89201afcd1bd0e2` on `ds-bakery-master-v0.38-production`. Configuration and environment-variable names were captured; values were not read or exported. |

The function snapshots use `SUPABASE_URL` plus the platform key environment variables: `SUPABASE_PUBLISHABLE_KEYS`/`SUPABASE_SECRET_KEYS`, with legacy `SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` fallbacks. Keep credential values separately in approved private secret storage. The key names and source code do not back up the keys themselves. The existing imports use `npm:@supabase/supabase-js@2`; no dependency lockfile was returned by the deployed-function download.

## Auth URL update reported

On 2026-10-07 at 00:32 Uganda time, the Owner confirmed saving the production Site URL `https://ds-bakery-web-production.up.railway.app` and redirect `https://ds-bakery-web-production.up.railway.app/auth/callback?next=/reset-password`, after reporting the previous Site URL as `http://localhost:3000`. This records the Owner's confirmation; the connector cannot independently read these private settings. Email delivery, SMTP configuration and the complete recovery flow remain unverified. No email was sent and no live-operation control was changed by this checkpoint update.

## Historical observation: custom SMTP disabled

The Owner's production SMTP screenshot on 2026-10-07 at 00:38 Uganda time shows **Enable custom SMTP OFF**. No SMTP credential was read, no email was sent and the switch was not changed. The captured deployed `create-staff-account` source uses Auth admin `createUser` with `email_confirm: true`, so creating staff through the existing Owner flow does not depend on invitation email delivery. This source review is not a new end-to-end login test.

With Supabase's default mailer, Auth email recipients are restricted to project-team addresses. General staff invitations and password recovery therefore need an appropriate email-delivery configuration before they can be considered verified. Email hooks, provider settings and actual delivery remain unreviewed; do not turn on an empty SMTP configuration. See the [official SMTP requirements](https://supabase.com/docs/guides/auth/auth-smtp).

## Gmail SMTP setup reported saved

On 2026-10-07 at 00:52 Uganda time, the Owner confirmed saving custom SMTP after receiving the Gmail setup: `smtp.gmail.com`, port `587`, sender name `DS Bakery`, the Owner's bakery Gmail address as sender/username, and a privately generated Google App Password. This records the Owner's confirmation, not an independent readback or delivery result. The actual address and credential values are excluded from this public checkpoint. The earlier OFF screenshot remains historical evidence.

A subsequent read-only preflight confirmed Production Lock ON, operations OFF, two existing Auth users and one active staff profile with an available existing Owner. The configured sending address is not itself a registered app account; validation must use an existing staff login email. No account was created and no email was sent by this review. Next, the Owner requests one reset email from the production login page and reports delivery/error without sharing tokens. Only after delivery should the newest link and recovery-page behavior be checked in the same browser; a new password must not be entered or exposed in chat. SMTP delivery, callback behavior, password updating and subsequent login are still unverified.

## Remaining private settings review

1. Open production [Auth → URL Configuration](https://supabase.com/dashboard/project/sgmmiymjnqqorvtvpigw/auth/url-configuration). Verify the Site URL is `https://ds-bakery-web-production.up.railway.app`. Verify allowed redirects cover the application's actual password-reset/invitation destination `https://ds-bakery-web-production.up.railway.app/auth/callback?next=/reset-password`. Record non-secret URLs only; do not copy tokens or passwords.
2. Review configured Auth providers, email confirmation/recovery behavior, SMTP host/from settings, email templates and limits. Retain any required SMTP/provider credentials privately; do not send invitation or reset emails merely to inventory settings.
3. Verify separate retention of the backup passphrase and required deployment/API/function secret values. Confirm the Supabase provider-backup availability/retention for this project's actual plan; the recovery status strategy label is not proof of a provider backup.
4. Confirm any external jobs, webhooks, payment integrations, custom domains or email services and retain their non-secret setup plus privately stored credentials. The absence of database cron jobs does not prove that external jobs are absent.

Before a future full service drill, use a separately approved disposable environment. Neither existing bakery database is a restore target. Preserve Storage policy dependencies on application roles/functions, verify function authorization and service configuration, and prevent cloned services from sending business notifications. This inventory and source capture do not validate that complete exercise.

Production Lock stays ON and operations stay OFF throughout review. Final cutover requires the user's explicit approval. No purchase, supplier payment or staff account was created by this review, and the website deployment was not changed.

Official configuration references:

- https://supabase.com/docs/guides/functions/secrets
- https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys
- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/guides/auth/redirect-urls
