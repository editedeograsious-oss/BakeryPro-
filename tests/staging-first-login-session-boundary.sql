-- Verify the password-reset session boundary using an EXISTING, real auth.session.
-- No sessions or password values change; the only profile mutation is rolled back.
BEGIN;
DO $g$ BEGIN IF (SELECT environment_mode FROM public.system_environment_config WHERE id=1)<>'staging' THEN RAISE EXCEPTION 'staging only'; END IF; END $g$;
SELECT set_config('qa.staff',(SELECT s.user_id::text FROM auth.sessions s JOIN public.profiles p ON p.id=s.user_id LIMIT 1),true);
SELECT set_config('qa.session',(SELECT s.id::text FROM auth.sessions s WHERE s.user_id=current_setting('qa.staff')::uuid LIMIT 1),true);
SELECT set_config('request.jwt.claim.sub',current_setting('qa.staff'),true);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.staff'),'role','authenticated','session_id',current_setting('qa.session'))::text,true);
UPDATE public.profiles SET first_login_completed_at=
 (SELECT created_at-interval '1 second' FROM auth.sessions WHERE id=current_setting('qa.session')::uuid)
 WHERE id=current_setting('qa.staff')::uuid;
SET LOCAL ROLE authenticated;
DO $t$ BEGIN IF NOT public.ds_staff_session_is_fresh() OR public.current_staff_role() IS NULL
 THEN RAISE EXCEPTION 'Valid post-reset session incorrectly denied'; END IF; END $t$;
RESET ROLE;
UPDATE public.profiles SET first_login_completed_at=
 (SELECT created_at+interval '1 second' FROM auth.sessions WHERE id=current_setting('qa.session')::uuid)
 WHERE id=current_setting('qa.staff')::uuid;
SET LOCAL ROLE authenticated;
DO $t$ BEGIN IF public.ds_staff_session_is_fresh() OR public.current_staff_role() IS NOT NULL
 OR public.is_active_staff() OR public.is_active_viewer() OR public.staff_has_permission('reports:view')
 THEN RAISE EXCEPTION 'Pre-reset JWT inherited activated permissions'; END IF; END $t$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS' as first_login_old_jwt_denied_staging_rollback;
