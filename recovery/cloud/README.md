# Online recovery drill

The recovery tools can run on a GitHub-hosted Ubuntu machine. Docker/WSL do not need to be installed on the operator's laptop. Neither existing bakery project is allowed as a restore target.

The hosted restore-project route is blocked by the account's two-project free limit. Do not pause/delete either bakery project or upgrade billing to work around it. A disposable PostgreSQL 17 Supabase database on the GitHub-hosted runner is being checked instead. The local runner target accepts no hosted target URL, reuses only a freshly bootstrapped volume, has networking disabled and no published ports before any bakery import, and is removed after comparison. Its SQL runs through `docker exec` into the exact checked container ID.

`runner-preflight-workflow.yml` runs only on the isolated `ds-bakery-recovery-runner-preflight` branch. It supplies no bakery credentials and checks the real empty database using fictional SQL. A successful readiness check is not a bakery backup, restore drill or launch-gate pass. Real staging export/restore remains pending until this route passes and private source/encryption secrets are configured.

## Prepared, not yet run

The hosted recovery template is deliberately outside `.github/workflows`. The runner-readiness template may be installed on the isolated preflight branch; it cannot export either bakery database. A real database export, restore and passing evidence remain pending. The mock tests do not count as a real drill.

After an organisation is selected, obtain its quoted project cost and any required billing approval before creating the empty restore target. Do not delete or reuse the existing staging/production databases to make room.

## Private setup

In the repository's **Settings → Secrets and variables → Actions**, the Owner adds these repository secrets privately:

| Secret name | Value |
| --- | --- |
| `BAKERY_STAGING_DATABASE_URL` | Existing staging direct/session-pooler PostgreSQL URL, port 5432, TLS enabled |
| `BAKERY_RECOVERY_TARGET_DATABASE_URL` | Separate empty recovery project's direct/session-pooler URL, port 5432, TLS enabled |
| `BAKERY_BACKUP_PASSPHRASE` | A unique, randomly generated password of at least 32 characters; retain it in a password manager |

Keep the passphrase separately from the downloaded bundle. Losing it makes the bundle unreadable. Never put any of these values in workflow inputs, code, screenshots, chat or public logs.

The bakery source repository is public. Database output, SQL errors, dumps and restored manifests are redirected to a private runner directory, bundled, then encrypted with AES-256-GCM. The passphrase derives a key using PBKDF2-SHA256 (600,000 iterations, a fresh 16-byte salt). Each bundle uses a fresh 12-byte nonce and an authenticated format header. Only the encrypted bundle, its SHA-256 and a summary without table/financial data are uploaded. Public viewers may obtain the ciphertext; use a strong random passphrase.

## Activation and run

1. The template pins reviewed recovery commit `7d240ca21d9ce552520a7056cbc841979f8d9aef`. Verify that commit before activation; do not change its pin casually.
2. Finish private secrets and the separately approved empty target.
3. Put the completed template at `.github/workflows/ds-bakery-recovery.yml` on the default branch (`main`). Manual dispatch requires the workflow on the default branch. Check any default-branch deployment integrations before activation.
4. Open **Actions → DS Bakery staging recovery drill → Run workflow**. Supply only the non-secret target project ref, type `RESTORE_TO_TEST_ONLY`, and confirm staging writes are paused.
5. Download the encrypted recovery artifact. GitHub retains it for seven days; download and retain it off-site before expiry. Review the status in `result.json`. A failed or missing result is not a passing drill.

The workflow has no push, pull request or schedule trigger. It reads staging and imports only into the separately checked empty target. It never enables operations or writes launch/backup evidence. The source before/after comparison is not an atomic snapshot; keep staging quiet throughout the export.

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
