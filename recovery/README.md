# DS Bakery v0.38 recovery workflow

This operator workflow replaces the older archive scripts for the real recovery drill. It does not run in the Railway website and does not change live business operations.

## Evidence so far

- The read-only capture query ran successfully against both existing bakery databases.
- Both have 80 public application tables with RLS enabled. Production Lock remains ON and operations remain OFF.
- The automated safety tests use mocked command-line tools. The real staging export and isolated PostgreSQL 17 restore also passed on 2026-10-06: [run 37512818845](https://github.com/editedeograsious-oss/BakeryPro-/actions/runs/37512818845). Its encrypted artifact and hashes were retained; the actual source and restored manifests matched. Three matching Owner evidence records were saved, and the staging backup gate reads `pass`.
- Production still needs its own verified archive and matching recovery drill; production operations remain disabled. Its separate manual production-source workflow and [private setup guide](cloud/production-setup.md) are prepared; they require `BAKERY_PRODUCTION_DATABASE_URL`. Mocked checks are not production evidence.
- The initial credentials-free online runner check passed on 2026-10-06: [run 37489648596](https://github.com/editedeograsious-oss/BakeryPro-/actions/runs/37489648596). It verified the empty PostgreSQL 17 target, isolation, disabled scheduled jobs, test-only SQL and cleanup. It is not a bakery archive or restore drill.

## Trusted machine

For an online runner instead of a Windows installation, use the manual [GitHub Actions workflow](cloud/README.md). The temporary target has passed its readiness check and needs no third hosted Supabase project. The private staging connection and encryption passphrase are configured, and the staging drill passed. Keep staging quiet for any future export and comparison. The production archive and matching recovery drill remain pending. See the [retained staging evidence](cloud/README.md#staging-recovery-verified-production-recovery-pending).

Use Bash on Linux, macOS or Windows with WSL/Git Bash, Node.js 20+, Docker running, Supabase CLI, PostgreSQL `psql`, and `tar` on PATH.
Keep private environment settings and all backup files outside the public app and source control. Never paste connection strings or passwords into chat.
The Supabase CLI runs its dump through Docker. Check the installed CLI's version and `supabase db dump --help`; the backup script also does this before exporting.

Official setup and workflow references:

- https://supabase.com/docs/guides/local-development/cli/getting-started
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- https://www.postgresql.org/download/
- https://www.docker.com/products/docker-desktop/

## Source selection and backup

Start with staging for the first drill. Use these non-secret identifiers:

| Source | SOURCE_PROJECT_REF |
| --- | --- |
| Staging | kymadepeuqhcsjwbrgqq |
| Production | sgmmiymjnqqorvtvpigw |

Privately configure `DATABASE_URL`, `SOURCE_PROJECT_REF` and `BACKUP_DIR` in the trusted environment. The URL must use the source project's direct or session-pooler connection on port 5432. The guard rejects connection overrides and disabled TLS.
Do not create new bakery test purchases, payments or staff accounts. Avoid staging writes during the export. Production stays locked.

From the repository root, run:

```bash
bash recovery/backup.sh
```

The script captures a fresh source manifest before and after the dumps and stops if the compared values differ. It saves roles, schema, data, native migration history, source manifest, source metadata and checksums. It creates a private `.tar.gz` archive and a `.sha256` sidecar.
Do not treat the before/after comparison as an atomic database snapshot. It detects changes in the compared counts, balances, totals and settings; maintain a quiet source during this drill.

## Optional hosted restore target

The online runner workflow uses its own empty disposable target and does not need the hosted target settings below. These settings apply only to the separate `restore_test.sh` operator route.

Use a separately approved, empty Supabase test project. Neither current bakery project is an acceptable target.
This workflow does not create a project, authorize billing, delete data or clean an occupied target. Obtain any necessary project/cost approval before creating a new target.
Enable required non-default extensions in the new target using the official Supabase instructions. No Railway app should point to it.

Privately configure `TARGET_DATABASE_URL`, `TARGET_PROJECT_REF` and the original `SOURCE_PROJECT_REF`. Set `RESTORE_CONFIRM=RESTORE_TO_TEST_ONLY` in that environment after checking the target identity.
The guard validates the target project ref from the connection URL before querying it. The script then rejects targets with public application objects or Auth users before importing anything.

Run with the folder and archive printed by the backup command:

```bash
bash recovery/restore_test.sh /private/path/ds_bakery_TIMESTAMP_RANDOM /private/path/ds_bakery_TIMESTAMP_RANDOM.tar.gz
```

The script verifies file checksums, verifies the archive hash, and proves the folder's payload matches the supplied archive. Import errors stop the single-transaction restore.
It then compares a fresh restored manifest against this archive's source manifest. Counts for every public table, critical financial totals, material balances, Auth user count, migration history, RLS flags and launch guards must match. Only the manifest read timestamp is ignored.
Changing or removing an expected field fails verification. An SQL import or printed query result alone cannot produce a passing comparison.
Retain the printed restored-manifest path privately. If an import fails, inspect the trusted terminal and use the official troubleshooting guidance; do not ignore errors or modify the verified archive silently.

## Scope and passing evidence

This is a database recovery comparison, not a complete service recovery. Storage file contents, Edge Functions, Auth provider/SMTP settings, API keys, Railway configuration, custom encryption/Vault key handling and Realtime publications require their own recovery review. Do not connect cloned services that could send business notifications during the drill.
The script does not create backup evidence records or complete Go-Live Setup. After the real steps succeed, the Owner can record `backup_created`, `backup_verified` and `restore_drill` with the same backup label and archive SHA-256. Keep the archive and verification output as the supporting evidence.
The production archive must have its own matching verification/drill evidence; a staging restore does not prove the production archive.
Final production cutover still requires the user's explicit approval.
