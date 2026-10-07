-- Voided repayments keep their original negative amount and become effectively zero.
-- This matches the already-validated production constraint.
alter table public.customer_credit_ledger
  drop constraint customer_credit_ledger_amount_delta_check;
alter table public.customer_credit_ledger
  add constraint customer_credit_ledger_amount_delta_check
  check (amount_delta <> 0 or
    (entry_type='payment' and reversed_at is not null and reversed_original_amount_delta < 0));
