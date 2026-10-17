-- Strict viewer security regression. Rollback-only, staging only.
BEGIN;
DO $g$ BEGIN IF (SELECT environment_mode FROM public.system_environment_config WHERE id=1)<>'staging' THEN RAISE EXCEPTION 'staging only'; END IF; END $g$;
SELECT set_config('qa.staff',(SELECT id::text FROM public.profiles WHERE role='cashier' AND active LIMIT 1),true);
UPDATE public.profiles SET role='viewer' WHERE id=current_setting('qa.staff')::uuid;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.staff'),true);
SET LOCAL ROLE authenticated;
DO $test$ DECLARE cmd text; denied boolean;
BEGIN
 IF public.is_active_staff() OR NOT public.is_active_viewer() THEN RAISE EXCEPTION 'Role boundary failure'; END IF;
 IF (SELECT count(*) FROM public.ds_sync_revision)<>2 THEN RAISE EXCEPTION 'Viewer sync access failure'; END IF;
 IF public.staff_has_permission('inventory:write') THEN RAISE EXCEPTION 'Viewer has write permission'; END IF;
 PERFORM public.viewer_product_stock();
 FOREACH cmd IN ARRAY ARRAY[
   'SELECT public.clock_in_staff()',
   'SELECT public.clock_out_staff()',
   'SELECT public.update_my_profile(''DENIED'')',
   'SELECT public.mark_all_staff_notifications_read()',
   'SELECT public.mark_staff_notification_read(gen_random_uuid())'
 ] LOOP
   denied:=false;
   BEGIN EXECUTE cmd;
   EXCEPTION WHEN OTHERS THEN
     denied := SQLERRM ILIKE '%Active staff account required%' OR SQLERRM ILIKE '%Active operational staff required%';
   END;
   IF NOT denied THEN RAISE EXCEPTION 'Viewer mutation was not denied: %',cmd; END IF;
 END LOOP;
END $test$;
RESET ROLE;
UPDATE public.profiles SET role='cashier' WHERE id=current_setting('qa.staff')::uuid;
SET LOCAL ROLE authenticated;
DO $test$ BEGIN IF NOT public.is_active_staff() OR public.is_active_viewer()
 THEN RAISE EXCEPTION 'Cashier role regression'; END IF; END $test$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS' as strict_viewer_staging_rollback;
