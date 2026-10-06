# Online recovery drill

The recovery tools can run on a GitHub-hosted Ubuntu machine. Docker/WSL do not need to be installed on the operator's laptop. Neither existing bakery project is allowed as a restore target.

The hosted restore-project route is blocked by the account's two-project free limit. Do not pause/delete either bakery project or upgrade billing to work around it. The disposable PostgreSQL 17 Supabase database on the GitHub-hosted runner passed its real readiness check instead. The local runner target accepts no hosted target URL, reuses only a freshly bootstrapped volume, has networking disabled and no published ports before any bakery import, and is removed after comparison. Its SQL runs through `docker exec` into the exact checked container ID.

`runner-preflight-workflow.yml` runs only on the isolated `ds-bakery-recovery-runner-preflight` branch. It supplies no bakery credentials and checks the real empty database using fictional SQL. The passing run on 2026-10-06 is [37489648596](https://github.com/editedeograsious-oss/BakeryPro-/actions/runs/37489648596), using reviewed tools commit `61febb65d1196851b9b0cb1f121b652fd74042ea`. All 12 recovery safety tests, PostgreSQL 17, managed Auth schema, empty bootstrap, disabled scheduled jobs, no network/published ports, test-only SQL and exact-resource cleanup passed. This is not a bakery backup, restore drill or launch-gate pass. Real staging export/restore remains pending until private source/encryption secrets are configured and the manual drill succeeds.

## Readiness verified; bakery drill pending

The manual runner recovery workflow is installed at `.github/workflows/ds-bakery-recovery.yml` on `main`, pinned to reviewed recovery tools. It has no automatic trigger. The hosted recovery template remains outside `.github/workflows`. The separate runner-readiness job cannot export either bakery database. A real bakery database export, restore and passing evidence remain pending. The mock tests and runner-readiness check do not count as a real drill.

The first real manual attempt, [37505876487](https://github.com/editedeograsious-oss/BakeryPro-/actions/runs/37505876487), stopped at setup before temporary-target creation or staging export. Both private secrets were supplied and the manual confirmations were correct. No archive or recovery evidence was produced. Setup diagnostics now identify the failed check using fixed public codes and instructions; they never print secret values or original exception messages. `BACKUP_PASSPHRASE` identifies the encryption-key requirement, while `SOURCE_CONNECTION` identifies the staging connection-string requirement. Correct the named secret privately before starting a new manual attempt. The recovery target, export, restore, encryption and launch guards remain the same as the passing readiness revision.

The disposable runner route needs no third hosted Supabase project. If the optional hosted-target route is used later, obtain the organisation's quoted project cost and any required billing approval first. Do not delete or reuse the existing staging/production databases to make room.

## Private setup

In the repository's **Settings → Secrets and variables → Actions**, the Owner adds these repository secrets privately:

| Secret name | Value |
| --- | --- |
| `BAKERY_STAGING_DATABASE_URL` | Existing staging direct/session-pooler PostgreSQL URL, port 5432, TLS enabled |
| `BAKERY_BACKUP_PASSPHRASE` | A unique, randomly generated password of at least 32 characters; retain it in a password manager |

The disposable runner workflow uses exactly these two secrets. The optional hosted-target workflow additionally requires `BAKERY_RECOVERY_TARGET_DATABASE_URL`, pointing at a separately approved empty recovery project. It is not needed for the runner route.

Keep the passphrase separately from the downloaded bundle. Losing it makes the bundle unreadable. Never put any of these values in workflow inputs, code, screenshots, chat or public logs.

The bakery source repository is public. Database output, SQL errors, dumps and restored manifests are redirected to a private runner directory, bundled, then encrypted with AES-256-GCM. The passphrase derives a key using PBKDF2-SHA256 (600,000 iterations, a fresh 16-byte salt). Each bundle uses a fresh 12-byte nonce and an authenticated format header. Only the encrypted bundle, its SHA-256 and a summary without table/financial data are uploaded. Public viewers may obtain the ciphertext; use a strong random passphrase.

## Activation and run

1. The credentials-free runner-readiness check passed using `61febb65d1196851b9b0cb1f121b652fd74042ea`. The temporary-target implementation remains identical to that passing revision. `runner-workflow.yml` pins an immutable reviewed recovery-tools revision with safe setup diagnostics; all 13 recovery safety tests pass for the diagnostic changes. Do not change the pin casually. The older `workflow.yml` template remains an optional hosted-target route.
2. Finish the two private secrets. Keep staging quiet for the full export and comparison.
3. The completed runner template is installed at `.github/workflows/ds-bakery-recovery.yml` on the default branch (`main`). Manual dispatch requires the workflow on the default branch. The existing DS Bakery v0.38 Railway services use their separate staging/production branches; their sources were checked before this workflow was installed.
4. Open **Actions → DS Bakery staging recovery drill → Run workflow**. Type `RESTORE_TO_TEST_ONLY` and confirm staging writes are paused. The temporary runner target is selected by the reviewed workflow; no hosted target URL/ref is accepted.
5. Download the encrypted recovery artifact. GitHub retains it for seven days; download and retain it off-site before expiry. Review the status in `result.json`. A failed or missing result is not a passing drill.

The real recovery workflow has no push, pull request or schedule trigger. It reads staging and imports only into the separately checked empty target. The temporary target uses the source's PostgreSQL image version `17.11.0.002`, no network and no published ports, with scheduled jobs disabled at server startup. Cleanup removes only the run's exact container IDs and fresh volume; it never prunes other resources. It never enables operations or writes launch/backup evidence. The source before/after comparison is not an atomic snapshot; keep staging quiet throughout the export.

The CLI is pinned to `2.119.0` and its release asset is checked against the SHA-256 published in the GitHub release metadata. Checkout/upload actions are pinned to reviewed commit SHAs. The runner checks Docker and uses the existing TLS/project/empty-target guards and strict manifest comparison.

## Read an encrypted bundle privately

On a trusted machine with Node.js 20+, configure `BACKUP_ENCRYPTION_PASSPHRASE` privately, then use:

```bash
node recovery/cloud/encrypted_bundle.mjs decrypt /private/recovery-bundle.enc /private/recovery-bundle.tar.gz
```

The helper refuses an existing output file. An incorrect passphrase, corrupted header, altered ciphertext or wrong authentication tag leaves no decrypted output. The bundle contains the original database archive and checksums, source and restored evidence, and detailed diagnostics. Diagnostics can include sensitive database values; do not share the decrypted bundle publicly.

After a real pass, verify and retain the matching archive label/SHA-256 and source/restored evidence before recording Owner backup events. This first workflow is staging only. Production needs its own archive and matching drill evidence later.

This verifies database recovery only. Storage files, Auth/SMTP provider settings, Edge Functions, Vault/encryption-key portability, Realtime, Railway configuration and external jobs require separate service-recovery review. Production Lock and live-operation controls remain unchanged.

Official references:

- https://docs.github.com/en/actions/concepts/runners/github-hosted-runners
- https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
