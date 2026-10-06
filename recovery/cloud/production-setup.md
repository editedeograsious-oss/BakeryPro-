# Production database recovery setup

Staging passed its real recovery drill in run `37512818845`, and the matching encrypted evidence is retained. Production still requires its own source-bound archive and matching restore. Neither bakery database may be a restore target. Production Lock must remain ON and operations must remain OFF.

The production-source workflow is manual only. It reads production and imports into the same fresh, checked PostgreSQL 17 runner target, with no networking or published ports and scheduled jobs disabled. The target implementation is identical to the implementation that passed the real staging drill. The separate production entry point fixes its source to `sgmmiymjnqqorvtvpigw`, rejects an incorrect source URL, and cannot pass with an unlocked, active or incorrectly labelled production manifest. The staging workflow retains its existing tested pin.

Preparation passed all 16 recovery safety tests. The Windows PowerShell helper also passed its real Windows check [37517150458](https://github.com/editedeograsious-oss/BakeryPro-/actions/runs/37517150458) using fictional inputs only: project/session-pooler parsing, special-character encoding, TLS preservation, unsafe-template rejection before requesting a password, and suppressed private output. No database or real clipboard was accessed by that check. These checks are preparation; production recovery remains unverified.

## One additional private secret

1. Open [DS Bakery Production in Supabase](https://supabase.com/dashboard/project/sgmmiymjnqqorvtvpigw?showConnect=true&method=session). Choose **Connect → Session pooler → URI** and use port **5432**. The username must be `postgres.sgmmiymjnqqorvtvpigw`. Copy the template with its password placeholder; obtain the actual pooler hostname from this project rather than guessing it.
2. To encode password symbols without printing the password or completed URL, copy the contents of [prepare-production-connection.ps1](prepare-production-connection.ps1) into Windows PowerShell. It prompts for the production template and the production database password privately, verifies the project/session-pooler identity, and places the completed TLS URL on your clipboard. Do not send a password or completed URL in chat or screenshots.
3. Open [GitHub Actions secrets](https://github.com/editedeograsious-oss/BakeryPro-/settings/secrets/actions). Add or update `BAKERY_PRODUCTION_DATABASE_URL` using the completed production URL. Reuse the existing `BAKERY_BACKUP_PASSPHRASE` secret and retain that key separately from the archives.

The URI value has this structure, with the actual hostname copied from Supabase:

```text
postgresql://postgres.sgmmiymjnqqorvtvpigw:<URL-ENCODED-PRODUCTION-PASSWORD>@<ACTUAL-PRODUCTION-SESSION-POOLER-HOST>:5432/postgres?sslmode=require
```

The hostname and password placeholders above are not usable secret values. The helper asks for the existing production database password; it does not reset a password, change an app API key or change operations.

## Manual production-source drill

After the private secret is saved, open **Actions → DS Bakery production recovery drill → Run workflow**, choose **main**, enter `RESTORE_TO_TEST_ONLY`, confirm production is unused for the full export/comparison, and run it. No source or target selector is offered. The reviewed workflow chooses its source and the isolated target.

The workflow reads production only. It produces an encrypted archive and a safe summary, removes the exact temporary target and retains ciphertext for seven days. It never writes passing backup events, enables operations or performs cutover. A real pass and retained matching evidence are required before Owner backup events may be recorded in production. The mocked production safety checks are preparation only; they are not real production recovery evidence.

After database recovery, separately review Storage files, Auth/provider/SMTP settings, Edge Functions, Vault/encryption-key portability, Realtime, Railway configuration and external jobs. Final cutover still requires explicit Owner approval.

Official connection reference: https://supabase.com/docs/guides/database/connecting-to-postgres

## First production export and private credential correction

Run [37526164513](https://github.com/editedeograsious-oss/BakeryPro-/actions/runs/37526164513), using tools `6626fb805324fd71ed6e583aed8bb347086daa91`, failed during export before any restore or completed database archive. Its exact temporary target was removed. The encrypted failure report was retained as `DS_Bakery_Production_Recovery_20261006_Attempt1.zip`; its ZIP SHA-256 is `62437fc2e181e9a327591eb7fd37d0948f6e5965c214319b6669ff186f879805`, and encrypted bundle SHA-256 is `9097c426d9c61c9920cd75cd8e257c34e2c0ee74ddb2f40a2afece6569e491de`. This is failed-run evidence, not a database backup or recovery pass.

Private diagnosis [37527249295](https://github.com/editedeograsious-oss/BakeryPro-/actions/runs/37527249295) authenticated that exact ciphertext and failed-production identity, returned only `SOURCE_AUTHENTICATION_FAILED`, and removed temporary plaintext. No database connection was supplied to the diagnosis. Production recovery remains unverified and has no passing backup/restore evidence.

Correct the existing `BAKERY_PRODUCTION_DATABASE_URL` privately using the current production database password and the actual production Session pooler URI from Supabase. If the password previously shown in a screenshot was real, replace it first at the production Database Settings page. Use the PowerShell helper with the untouched password placeholder at its first prompt and the replacement password only at the separate hidden prompt. Update the existing GitHub secret; do not change the backup passphrase.

Then start a **new** manual production recovery run on **main**, with the same exact restore confirmation and a quiet production source. Re-running the first failure uses its older immutable workflow, whose artifact name does not separate attempts. The updated workflows include the attempt number in encrypted-artifact names, preserving each attempt without deleting an earlier report. The updated production tools automatically emit fixed-category backup diagnosis; private database errors remain encrypted. The new safe category does not change a failed result to passed.

Supabase documents that the shared pooler can temporarily return authentication failures immediately after a password reset; retry with the current password if this happens. Credentials must still match the production database. Official reference: https://supabase.com/docs/guides/troubleshooting/how-do-i-reset-my-supabase-database-password-oTs5sB
