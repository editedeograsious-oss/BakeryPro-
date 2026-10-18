-- Verify a suspended cashier cannot invoke management SECURITY DEFINER RPCs.
-- Specifically guards against PostgreSQL NULL-role comparisons failing open.
BEGIN;
DO $g$ BEGIN IF (SELECT environment_mode FROM public.system_environment_config WHERE id=1)
 IS DISTINCT FROM 'staging' THEN RAISE EXCEPTION 'STAGING ONLY'; END IF;END $g$;
SELECT set_config('qa.cashier',(SELECT id::text FROM public.profiles WHERE role='cashier' AND active ORDER BY id LIMIT 1),true);
SELECT set_config('qa.owner',(SELECT id::text FROM public.profiles WHERE role='owner' AND active LIMIT 1),true);
UPDATE public.profiles SET active=false,disabled_at=now()
 WHERE id=current_setting('qa.cashier')::uuid;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.cashier'),true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE cmd text; was_denied boolean;
BEGIN
 IF public.current_staff_role() IS NOT NULL OR public.is_active_staff()
 THEN RAISE EXCEPTION 'Suspended staff role was not cleared'; END IF;
 FOREACH cmd IN ARRAY ARRAY[
  'SELECT public.owner_dashboard_summary()',
  'SELECT public.management_alerts()',
  'SELECT public.set_staff_active(gen_random_uuid(),false)',
  'SELECT public.save_product(NULL::uuid,''STAGING-WRONG-ACCOUNT'',NULL::uuid,10,NULL)',
  'SELECT public.start_cashier_shift(0)'
 ] LOOP
  was_denied:=false;
  BEGIN EXECUTE cmd;
  EXCEPTION WHEN OTHERS THEN
   was_denied:=SQLERRM ILIKE '%Not authorized%'
    OR SQLERRM ILIKE '%Only owner%'
    OR SQLERRM ILIKE '%Only an active%'
    OR SQLERRM ILIKE '%Owner or manager%'
    OR SQLERRM ILIKE '%Owner or Manager%';
  END;
  IF NOT was_denied THEN
    RAISE EXCEPTION 'Suspended account not denied at first authorization boundary: %',cmd;
  END IF;
 END LOOP;
END $t$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS' AS blocked_suspended_cashier_sensitive_management_rpcs;
