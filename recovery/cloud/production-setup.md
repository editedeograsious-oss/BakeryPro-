# Production database recovery setup

Staging and production have both passed their real database recovery comparisons. Production passed in [run 37529519835, attempt 2](https://github.com/editedeograsious-oss/BakeryPro-/actions/runs/37529519835), using tools `8a0e1dd6a6667faf8a3cdd906dee824cdda96fbf`. The matching encrypted archive was independently checked and retained before three genuine Owner evidence events were recorded. The production backup gate reads `pass`. Production Lock remains ON and operations remain OFF. Full service recovery still requires the [separate settings review](../services/README.md); final cutover requires explicit Owner approval.

## Verified production evidence

The source before/after and actual restored manifests matched for stock balances, financial totals, every public table count, Auth-user count, migration history, RLS coverage and operation guards. The exact isolated temporary target and fresh volume were removed. Neither existing bakery database was a restore target.

| Evidence | Identifier |
| --- | --- |
| Source | Production `sgmmiymjnqqorvtvpigw` |
| Completion | `2026-10-06T20:57:21.706Z` (23:57 Uganda time) |
| Archive label | `ds_bakery_20261006T205550Z_xOrRrM` |
| Original database archive SHA-256 | `2ecb6b3828f84789d8c402e46f18c9c9e4b50c20827efac7727be385212ecfca` |
| Encrypted bundle SHA-256 | `3c0c113669e1be798f562b0658678f58a3ca55b6465adfce9a637e6a8983c62f` |
| Downloaded artifact ZIP SHA-256 | `f06db5535dc51791040716e505dd30d9df7eac9695c7f9841d31cd06aeef1349` |
| GitHub artifact | `11444575317` |
| Retained encrypted file | `DS_Bakery_Production_Recovery_20261006_Verified.zip` |

The ZIP contains exactly `recovery-bundle.enc`, `recovery-bundle.enc.sha256` and the safe `result.json`. Its downloaded bytes match the GitHub artifact digest, and the ciphertext matches its checksum sidecar. The passing result is bound to the production source, tools pin, actual restore comparison and successful cleanup. The existing Owner-only RPC recorded `backup_created`, `backup_verified` and `restore_drill` with the same archive label and original database archive checksum; readback confirms archive evidence ready, restore drill passed and backup gate `pass`. This evidence update created no bakery purchases, payments or stock movements.

The production-source workflow is manual only. It reads production and imports into the same fresh, checked PostgreSQL 17 runner target, with no networking or published ports and scheduled jobs disabled. The target implementation is identical to the implementation that passed the real staging drill. The separate production entry point fixes its source to `sgmmiymjnqqorvtvpigw`, rejects an incorrect source URL, and cannot pass with an unlocked, active or incorrectly labelled production manifest. The staging workflow retains its existing tested pin.

Before the real production pass, preparation passed all 18 recovery safety tests. The Windows PowerShell helper also passed its real Windows check [37517150458](https://github.com/editedeograsious-oss/BakeryPro-/actions/runs/37517150458) using fictional inputs only: project/session-pooler parsing, special-character encoding, TLS preservation, unsafe-template rejection before requesting a password, and suppressed private output. No database or real clipboard was accessed by that check. Those checks are preparation; the actual production recovery evidence is the passing run above.

## Private setup for future runs

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

This is historical failure evidence. The credential correction and subsequent successful recovery are complete; the retained failure must not be relabelled as a pass.

Run [37526164513](https://github.com/editedeograsious-oss/BakeryPro-/actions/runs/37526164513), using tools `6626fb805324fd71ed6e583aed8bb347086daa91`, failed during export before any restore or completed database archive. Its exact temporary target was removed. The encrypted failure report was retained as `DS_Bakery_Production_Recovery_20261006_Attempt1.zip`; its ZIP SHA-256 is `62437fc2e181e9a327591eb7fd37d0948f6e5965c214319b6669ff186f879805`, and encrypted bundle SHA-256 is `9097c426d9c61c9920cd75cd8e257c34e2c0ee74ddb2f40a2afece6569e491de`. This is failed-run evidence, not a database backup or recovery pass.

Private diagnosis [37527249295](https://github.com/editedeograsious-oss/BakeryPro-/actions/runs/37527249295) authenticated that exact ciphertext and failed-production identity, returned only `SOURCE_AUTHENTICATION_FAILED`, and removed temporary plaintext. No database connection was supplied to the diagnosis. Production had no passing backup/restore evidence at that point.

The production database credential and existing `BAKERY_PRODUCTION_DATABASE_URL` were subsequently updated privately, using the actual production Session pooler URI and the helper's separate hidden password prompt. The backup passphrase was retained unchanged. Credentials were not published.

A new manual run on **main**, `37529519835`, initially reported `SOURCE_AUTHENTICATION_FAILED` during export. Retrying its failed job succeeded on attempt 2 with the unchanged updated credential. The updated workflows include the attempt number in encrypted-artifact names, so each attempt's report remains distinct. The production tools automatically emit fixed-category backup diagnosis; private database errors remain encrypted. Diagnosis never changes a failed result to passed.

Supabase documents that the shared pooler can temporarily return authentication failures immediately after a password reset; retry with the current password if this happens. Credentials must still match the production database. Official reference: https://supabase.com/docs/guides/troubleshooting/how-do-i-reset-my-supabase-database-password-oTs5sB
