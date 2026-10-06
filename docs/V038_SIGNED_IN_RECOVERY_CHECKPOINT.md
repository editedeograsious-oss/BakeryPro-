# DS Bakery v0.38 — signed-in validation and recovery checkpoint

Verified 2026-10-06 with the deployed staging Owner session.

## Supplier workflow
The existing PO-20261005-000005 purchase is UGX 100,000 for 25 kg of STAGING TEST Flour.
Voiding the existing STAGING-PAY-002-EDIT payment changed this purchase to UGX 0 paid / UGX 100,000 outstanding.
Restoring the same payment returned it to UGX 50,000 paid / UGX 50,000 outstanding, Partial.
The statement and payment controls matched both states. Purchases & Receiving shows the completed 25 kg receipt.
No duplicate purchase or payment was created: 3 purchases and 2 supplier payments remain; flour stock is 95 kg.
The whole supplier account has UGX 350,000 in purchases, UGX 110,000 paid and UGX 240,000 outstanding.

## Payroll and finance
Signed-in Payroll, Expenses, Financial Reports and Daily Closing were checked.
Active salary payments and payroll expenses both total UGX 555,000; today’s bank expenses show UGX 555,000.
The old voided UGX 280,000 salary expense contributes zero; all active expenses total UGX 557,000.
Financial Reports shows UGX 20,000 sales, UGX 8,000 COGS, UGX 12,000 gross profit and UGX -545,000 operating profit.
No day was closed during these visual checks.
The historical October UGX 270,000 payroll payment lacks its advance-allocation history. Reversal remains blocked with a review message; no unproven allocation was invented.

## Database and launch status
Staging Runtime Health shows database connection, Supabase configuration and authentication PASS.
Staging database integrity has zero failures and two warnings: existing staging placeholders and outstanding formal connection evidence.
Owner browser-login evidence was recorded only after observing the successful interactive staging login.
Production has 17 passing integrity checks. The separate go-live setup and operations checks remain blocked intentionally.
Production Lock is ON, operations_enabled is false, and the existing production UGX 25,000 sales total is unchanged.

## Recovery corrections applied
Recovery totals exclude voided expenses and include supplier-payment, payroll and advance coverage.
The backup gate requires the latest backup, archive verification and restore drill to match both label and archive SHA-256 checksum in order.
A newer failed restore or a new archive invalidates an older passing drill.
Owner/Manager read access and Owner-only evidence writing reject missing staff roles.
Rollback-only staging tests passed for totals, evidence ordering, mismatches, missing checksums and Owner/Manager/Cashier/unregistered role behavior.
Those temporary test events were rolled back. Each database retains only its pre-existing plan_prepared event; no real backup/restore evidence has been fabricated.
Security advisor checks retain the same three aggregate warning categories.

## Remaining recovery work
A real export and separate-target restore drill have not been run. The backup gate is pending.
This execution workspace has no Supabase CLI, Docker or psql, no configured secure database connections and no designated empty restore target.
Use a trusted backup machine with those tools. Load credentials through its secure environment; never put connection strings in chat, Git, screenshots or the public application.
Use the existing backup:preflight, backup:supabase and backup:verify commands.
Calculate the SHA-256 of the resulting tar.gz archive; retain the archive, its file checksums and the fresh source recovery_verification_manifest() result securely.
Restore only into a separate empty non-production target. Do not overwrite either existing bakery database.
Compare the restored v0.38 critical_counts, integrity and financial_totals with that fresh source manifest, not the old v0.34 baseline.
A successful SQL import or printed verification query alone does not establish a passing restore drill.
Record passing backup_created, backup_verified and restore_drill evidence only after the respective real steps succeed, using the same archive label and archive SHA-256.
Then review launch readiness. Final production cutover still requires the user's explicit approval.

## Deployment
Web fixes were built and deployed successfully before these signed-in checks.
Web commits used for the initial signed-in checks:
Staging: 1db532e88a585c09cbd1e12e80d6285dd56af0f9
Production: ddc3e83a1a7aac958a79486b23524f8bc5f532ae
The recovery functions were deployed directly as native Supabase migrations.
System Status environment wording was also corrected to use the runtime environment, so production no longer describes itself as staging. The existing readiness render tests cover both environment labels.
