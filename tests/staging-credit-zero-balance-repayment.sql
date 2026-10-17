-- DS Bakery: cashier repayment of UGX 30,000 against a customer with zero debt.
-- SQL role and session are simulated for a rollback-only staging regression.
BEGIN;
DO $gate$ BEGIN
 IF (SELECT environment_mode FROM public.system_environment_config WHERE id=1)<>'staging'
 THEN RAISE EXCEPTION 'Staging only'; END IF;
END $gate$;
SELECT set_config('test.credit.cashier',(SELECT p.id::text
 FROM public.profiles p JOIN auth.users u ON u.id=p.id
 WHERE p.role='cashier' AND p.active AND p.disabled_at IS NULL
 AND u.last_sign_in_at IS NOT NULL LIMIT 1),true);
SELECT set_config('test.credit.customer',(SELECT customer_id::text FROM public.customer_credit_summary
 WHERE credit_enabled=true AND balance_due=0 LIMIT 1),true);
SELECT set_config('request.jwt.claim.sub',current_setting('test.credit.cashier'),true);
SET LOCAL ROLE authenticated;
DO $assert$
DECLARE rejected text; previous_count bigint; updated_count bigint;
BEGIN
 IF NOT public.staff_has_permission('credit:manage') THEN
  RAISE EXCEPTION 'Cashier missing credit management permission'; END IF;
 SELECT count(*) INTO previous_count FROM public.customer_credit_ledger;
 BEGIN
  PERFORM public.record_credit_payment(current_setting('test.credit.customer')::uuid,
    30000,'cash',null,'Rollback credit repayment test',gen_random_uuid());
  RAISE EXCEPTION 'Incorrectly accepted repayment with zero outstanding debt';
 EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM; END;
 IF rejected NOT LIKE '%no outstanding credit balance%' THEN
  RAISE EXCEPTION 'Wrong validation error: %',rejected; END IF;
 SELECT count(*) INTO updated_count FROM public.customer_credit_ledger;
 IF updated_count<>previous_count THEN RAISE EXCEPTION 'Failed repayment modified credit ledger'; END IF;
END $assert$;
RESET ROLE;
SELECT jsonb_build_object('status','PASS','cashier_credit_permission',true,
 'zero_balance_repayment_denied',true,'no_ledger_changes',true,'rollback',true) as audit;
ROLLBACK;
