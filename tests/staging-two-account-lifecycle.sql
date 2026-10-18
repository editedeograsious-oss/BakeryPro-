-- Simulate owner-controlled disable/re-enable and role changes with two
-- distinct existing cashier identities. Entire transaction is rolled back.
BEGIN;
DO $guard$ BEGIN IF (SELECT environment_mode FROM public.system_environment_config WHERE id=1) IS DISTINCT FROM 'staging'
 THEN RAISE EXCEPTION 'STAGING ONLY'; END IF; END $guard$;
SELECT set_config('qa.owner',(SELECT id::text FROM public.profiles WHERE role='owner' AND active LIMIT 1),true);
SELECT set_config('qa.cashier_a',(SELECT id::text FROM public.profiles WHERE role='cashier' AND active ORDER BY id OFFSET 0 LIMIT 1),true);
SELECT set_config('qa.cashier_b',(SELECT id::text FROM public.profiles WHERE role='cashier' AND active ORDER BY id OFFSET 1 LIMIT 1),true);
DO $g$ BEGIN IF current_setting('qa.cashier_a')=current_setting('qa.cashier_b')
 THEN RAISE EXCEPTION 'Two cashier accounts required'; END IF; END $g$;

-- CEO disables only cashier A.
SELECT set_config('request.jwt.claim.sub',current_setting('qa.owner'),true);
SET LOCAL ROLE authenticated;
SELECT public.set_staff_active(current_setting('qa.cashier_a')::uuid,false);
RESET ROLE;

-- Cashier A must immediately lose database authorization.
SELECT set_config('request.jwt.claim.sub',current_setting('qa.cashier_a'),true);
SET LOCAL ROLE authenticated;
DO $verify$
DECLARE denied boolean:=false;
BEGIN
 IF public.is_active_staff() OR public.current_staff_role() IS NOT NULL
 OR public.staff_has_permission('credit:manage') THEN RAISE EXCEPTION 'Suspended cashier still authorized'; END IF;
 BEGIN PERFORM public.complete_sale_v038('[]'::jsonb,0,NULL,'[]'::jsonb);
 EXCEPTION WHEN OTHERS THEN denied:=SQLERRM ILIKE '%Not authorized to create sales%'; END;
 IF NOT denied THEN RAISE EXCEPTION 'Suspended cashier still allowed POS action'; END IF;
END $verify$;
RESET ROLE;

-- Cashier B must be unaffected.
SELECT set_config('request.jwt.claim.sub',current_setting('qa.cashier_b'),true);
SET LOCAL ROLE authenticated;
DO $verify$ BEGIN
 IF public.current_staff_role()<>'cashier' OR NOT public.is_active_staff()
 THEN RAISE EXCEPTION 'Unrelated cashier was blocked'; END IF;
END $verify$;
RESET ROLE;

-- CEO changes the other account to baker.
SELECT set_config('request.jwt.claim.sub',current_setting('qa.owner'),true);
SET LOCAL ROLE authenticated;
SELECT public.change_staff_role(current_setting('qa.cashier_b')::uuid,'baker'::public.staff_role);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub',current_setting('qa.cashier_b'),true);
SET LOCAL ROLE authenticated;
DO $verify$
DECLARE denied boolean:=false;
BEGIN
 IF public.current_staff_role()<>'baker' OR NOT public.is_active_staff()
 THEN RAISE EXCEPTION 'Changed staff role not enforced'; END IF;
 BEGIN PERFORM public.complete_sale_v038('[]'::jsonb,0,NULL,'[]'::jsonb);
 EXCEPTION WHEN OTHERS THEN denied:=SQLERRM ILIKE '%Not authorized to create sales%'; END;
 IF NOT denied THEN RAISE EXCEPTION 'Demoted baker still permitted POS sales'; END IF;
END $verify$;
RESET ROLE;

-- Owner re-enables cashier A; old status is restored in DB during this QA.
SELECT set_config('request.jwt.claim.sub',current_setting('qa.owner'),true);
SET LOCAL ROLE authenticated;
SELECT public.set_staff_active(current_setting('qa.cashier_a')::uuid,true);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.cashier_a'),true);
SET LOCAL ROLE authenticated;
DO $verify$ BEGIN
 IF NOT public.is_active_staff() OR public.current_staff_role()<>'cashier'
 THEN RAISE EXCEPTION 'Re-enabled cashier not authorized'; END IF;
END $verify$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS' AS owner_disable_reenable_and_role_change_isolation;
