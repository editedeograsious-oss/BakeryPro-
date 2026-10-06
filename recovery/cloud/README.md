# Online recovery drill

The recovery tools can run on a GitHub-hosted Ubuntu machine. Docker/WSL do not need to be installed on the operator's laptop. Neither existing bakery project is allowed as a restore target.

The hosted restore-project route is blocked by the account's two-project free limit. Do not pause/delete either bakery project or upgrade billing to work around it. The disposable PostgreSQL 17 Supabase database on the GitHub-hosted runner passed its real readiness check instead. The local runner target accepts no hosted target URL, reuses only a freshly bootstrapped volume, has networking disabled and no published ports before any bakery import, and is removed after comparison. Its SQL runs through `docker exec` into the exact checked container ID.

`runner-preflight-workflow.yml` runs only on the isolated `ds-bakery-recovery-runner-preflight` branch. It supplies no bakery credentials and checks the real empty database using fictional SQL. The passing run on 2026-10-06 is [37489648596](https://github.com/editedeograsious-oss/BakeryPro-/actions/runs/37489648596), using reviewed tools commit `61febb65d1196851b9b0cb1f121b652fd74042ea`. All 12 recovery safety tests, PostgreSQL 17, managed Auth schema, empty bootstrap, disabled scheduled jobs, no network/published ports, test-only SQL and exact-resource cleanup passed. This is not a bakery backup, restore drill or launch-gate pass. The private staging connection and encryption secrets are now configured. The real staging recovery drill subsequently passed in run `37512818845`; see the matching retained evidence below.

## Staging recovery verified; production recovery pending

The manual runner recovery workflow is installed at `.github/workflows/ds-bakery-recovery.yml` on `main`, pinned to reviewed recovery tools. It has no automatic trigger. The hosted recovery template remains outside `.github/workflows`. The separate runner-readiness job cannot export either bakery database. A real staging export and separate-target restore passed on 2026-10-06, with a retained encrypted archive and matching staging Owner evidence. The mock tests and runner-readiness check do not count as a real drill.

The real staging drill [37512818845](https://github.com/editedeograsious-oss/BakeryPro-/actions/runs/37512818845) completed successfully at `2026-10-06T18:42:04.263Z` (21:42 Uganda time), using reviewed tools commit `aae5fc601eb9ae9e82c2603d86cb4758e25fc96f`. The source before/after capture and actual restored manifests matched, including stock balances, financial totals, every public table count, Auth-user count, migration history, RLS coverage and operation guards. The exact temporary database and its fresh volume were removed.

| Evidence | Identifier |
| --- | --- |
| Source | Staging `kymadepeuqhcsjwbrgqq` |
| Archive label | `ds_bakery_20261006T183944Z_5njn3r` |
| Original database archive SHA-256 | `6602f98bd414e715091c063b428eb16ebd886373727567ff9b47e9badd65f339` |
| Encrypted bundle SHA-256 | `c4e5ef4296f873a76cc9957c44b77d8dbdcdd04749a49c1fa7fedd03e6c30197` |
| Downloaded artifact ZIP SHA-256 | `bd73e030aa478d70f42428214b725e565f7ec9ed0ac01e65b91e35f06883db6d` |
| GitHub artifact | `11436335514` |
| Retained encrypted file | `DS_Bakery_Staging_Recovery_20261006_Verified.zip` |

The artifact ZIP and encrypted bundle hashes were independently verified after download. The retained ZIP contains only the ciphertext, its checksum and the safe passing result. No plaintext SQL or manifests were published. After retention, exactly three matching staging evidence records (`backup_created`, `backup_verified`, `restore_drill`) were recorded through the existing Owner-only RPC. Its status was read back: archive evidence ready, restore drill passed and staging backup gate `pass`, with operations still disabled. This evidence update happened outside the read-only source workflow and created no bakery purchases or payments.

Production has no recorded passing archive or restore drill. It needs its own source-bound encrypted backup and matching recovery test before the production backup gate can pass. Staging evidence does not satisfy that requirement. Production Lock remains ON, and live operations remain OFF. This staging drill is not final cutover approval.

The next production-source drill has a separate manual workflow and [private setup guide](production-setup.md). Its new private source secret is `BAKERY_PRODUCTION_DATABASE_URL`; it reuses the existing backup passphrase. The shared source guard defaults to staging, and the separate production entry point fixes the production source. All 16 recovery safety tests pass, including cross-project source/target rejection, production lock enforcement, incorrect environment rejection and suppressed private output. These mocked production checks are not a production drill. The staging workflow retains the tested tools pin that produced the verified archive.

## Earlier attempts and the permission correction

The first real manual attempt, [37505876487](https://github.com/editedeograsious-oss/BakeryPro-/actions/runs/37505876487), stopped at setup before temporary-target creation or staging export. Both private secrets were supplied and the manual confirmations were correct. No archive or recovery evidence was produced. Setup diagnostics now identify the failed check using fixed public codes and instructions; they never print secret values or original exception messages. `BACKUP_PASSPHRASE` identifies the encryption-key requirement, while `SOURCE_CONNECTION` identifies the staging connection-string requirement. Correct the named secret privately before starting a new manual attempt. The subsequent permission correction is described below; the source, isolation, archive, encryption and launch guards remain enforced.

Run [37506992524](https://github.com/editedeograsious-oss/BakeryPro-/actions/runs/37506992524), attempt 1, identified `SOURCE_CONNECTION`. After the staging URL was corrected privately, attempt 2 successfully exported staging and reached restore, which failed. Its temporary target was removed. Archive label `ds_bakery_20261006T180357Z_KOWy9F`, original archive SHA-256 `0d163cf494500f01e96bdd12ee1ad36a1c4c37ad7c4bc3404d58cac66889c826`, and encrypted bundle SHA-256 `07c394ac85cd97579d957b12855bdce2e09f29e6dca6691d81d4d6b51bfecf53` identify the retained encrypted evidence. This is an exported backup with an unsuccessful restore, not a passing recovery drill.

The separate manual `DS Bakery private recovery diagnosis` workflow reads only artifact `11432668083` from that failed run. It has no database connection secret and runs no database commands. It authenticates the pinned encrypted bundle using the existing backup key in a private temporary directory, checks the failed staging result's identity, reads only the private result/log members, and prints fixed error categories, fixed SQL filenames, bounded line numbers and known platform role names. Unknown identifiers, SQL values, error messages, passwords and stack traces are never returned. Plaintext temporary files are removed on success and failure. Diagnosis never marks recovery verified or changes any launch gate.

Diagnosis run [37510402320](https://github.com/editedeograsious-oss/BakeryPro-/actions/runs/37510402320) identified `PERMISSION_DENIED` in `roles.sql`, line 13. The tested correction uses the verified local `supabase_admin` only inside the exact fresh isolated container for role import and trigger-disabled data import. Schema files run under `SET ROLE postgres`, preserving application-object ownership and postgres default privileges. The original single transaction, `ON_ERROR_STOP=1`, archive checks and full financial/stock/Auth/migration/RLS/guard comparison remain required. An unavailable or non-superuser administrator stops the import before any schema preparation. The credentials-free online readiness probe exercises restricted-role rollback, privileged fictional role/data import, postgres schema ownership, RLS and exact cleanup before this correction is activated.

The revised native readiness check [37511947318](https://github.com/editedeograsious-oss/BakeryPro-/actions/runs/37511947318), using target code `e364cf8f4e009bc092f9553a818ba8ab0f54b6ab`, passed. It confirmed postgres is not a superuser, the local supabase_admin is a superuser, a superuser-only fictional role change fails and rolls back as postgres, the verified administrator imports it successfully, application-table ownership remains postgres, RLS stays enabled, fictional numeric data matches, and exact temporary resources are removed. All 12 safety tests on that isolated branch passed. The final main-branch tools also include the reviewed safe setup/diagnosis helpers and 15 passing local recovery safety tests. This is target readiness, not a successful bakery restore.

Future restore failures automatically include the same fixed-category diagnosis in the safe result and public job log. Raw SQL errors and exception details remain encrypted; diagnosis never changes a failed recovery result to passed.

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

1. The credentials-free runner-readiness check must pass for the reviewed temporary-target revision before `runner-workflow.yml` is repinned to it. The workflow pins an immutable reviewed tools commit. The older `workflow.yml` template remains an optional hosted-target route.
2. The two private secrets are configured. Keep staging quiet for the full export and comparison; no password needs to be shared in chat.
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

The passing staging archive and matching Owner evidence have now been retained and recorded. For future runs, verify and retain the matching archive label/SHA-256 and source/restored evidence before recording Owner backup events. This installed workflow is staging only. Production still needs its own archive and matching drill evidence.

This verifies database recovery only. Storage files, Auth/SMTP provider settings, Edge Functions, Vault/encryption-key portability, Realtime, Railway configuration and external jobs require separate service-recovery review. Production Lock and live-operation controls remain unchanged.

Official references:

- https://docs.github.com/en/actions/concepts/runners/github-hosted-runners
- https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore

## Production export diagnosis and retry handling

The first real production run `37526164513` failed during export, before any restore or completed database archive. The exact temporary target was removed, and the independently verified encrypted failure report was retained. Private diagnosis `37527249295` authenticated that exact failed-production ciphertext and reported only `SOURCE_AUTHENTICATION_FAILED`. A passing diagnosis is not a passing recovery drill; production still has no matching passing backup/restore evidence.

The production secret must be corrected privately before a new manual run on `main`. Production backup failures now automatically report fixed error categories without exposing credentials or database values. Recovery artifact names include the run attempt, so retries retain separate ciphertext rather than conflicting with or replacing previous evidence. The originally verified staging tools pin is unchanged, and the actual restore implementation and all operation guards are unchanged. All 18 recovery safety tests pass, including private diagnosis identity checks, plaintext cleanup and production authentication-error suppression. See [the production correction steps](production-setup.md#first-production-export-and-private-credential-correction).
