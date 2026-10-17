-- STAGING ONLY: tokens from before forced first-login completion must not
-- inherit the newly activated privileges, even if their JWT has not expired.
DO $guard$ BEGIN
 IF (SELECT environment_mode FROM public.system_environment_config WHERE id=1)
    IS DISTINCT FROM 'staging' THEN RAISE EXCEPTION 'Staging only'; END IF;
END $guard$;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS first_login_completed_at timestamptz;

CREATE OR REPLACE FUNCTION public.ds_staff_session_is_fresh()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO public, pg_temp AS $fn$
 SELECT COALESCE((
   SELECT CASE WHEN p.first_login_completed_at IS NULL THEN true
   ELSE EXISTS (
     SELECT 1 FROM auth.sessions s
     WHERE s.user_id=auth.uid()
       AND s.id::text=(auth.jwt()->>'session_id')
       AND s.created_at>p.first_login_completed_at
   ) END
   FROM public.profiles p WHERE p.id=auth.uid()
 ),false);
$fn$;
REVOKE EXECUTE ON FUNCTION public.ds_staff_session_is_fresh() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ds_staff_session_is_fresh() TO authenticated;

CREATE OR REPLACE FUNCTION public.current_staff_role()
RETURNS public.staff_role LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO public, pg_temp AS $fn$
 SELECT p.role FROM public.profiles p
 WHERE p.id=auth.uid() AND p.active=true AND p.disabled_at IS NULL
   AND p.require_password_reset=false
   AND public.ds_staff_session_is_fresh();
$fn$;

CREATE OR REPLACE FUNCTION public.is_active_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO public, pg_temp AS $fn$
 SELECT EXISTS(
   SELECT 1 FROM public.profiles p WHERE p.id=auth.uid()
     AND p.active=true AND p.disabled_at IS NULL
     AND p.require_password_reset=false
     AND p.role <> 'viewer'::public.staff_role
     AND public.ds_staff_session_is_fresh()
 );
$fn$;

CREATE OR REPLACE FUNCTION public.is_active_viewer()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO public, pg_temp AS $fn$
 SELECT EXISTS(
   SELECT 1 FROM public.profiles p WHERE p.id=auth.uid()
     AND p.active=true AND p.disabled_at IS NULL
     AND p.require_password_reset=false
     AND p.role='viewer'::public.staff_role
     AND public.ds_staff_session_is_fresh()
 );
$fn$;

CREATE OR REPLACE FUNCTION public.staff_has_permission(p_permission_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO public, pg_temp AS $fn$
 SELECT COALESCE((
   SELECT e.effective_allowed FROM public.profiles p
   JOIN public.effective_staff_permissions(auth.uid()) e ON TRUE
   WHERE p.id=auth.uid() AND p.active=true AND p.disabled_at IS NULL
     AND p.require_password_reset=false
     AND p.role <> 'viewer'::public.staff_role
     AND public.ds_staff_session_is_fresh()
     AND e.permission_key=p_permission_key
 ),false);
$fn$;

-- Only trusted backend service role can clear the first-login pending flag.
-- The timestamp is the security boundary for pre-reset JWT sessions.
CREATE OR REPLACE FUNCTION public.ds_complete_first_login(p_staff_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO public, pg_temp AS $fn$
DECLARE v_old boolean;
BEGIN
 UPDATE public.profiles
 SET require_password_reset=false,
     first_login_completed_at=clock_timestamp(),
     session_version=session_version+1,
     updated_at=clock_timestamp()
 WHERE id=p_staff_id AND active=true AND disabled_at IS NULL
   AND role<>'owner'::public.staff_role AND require_password_reset=true
 RETURNING true INTO v_old;
 IF v_old IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Pending active staff password change not found' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.audit_logs(actor_id,action,entity,entity_id,after_data)
 VALUES(p_staff_id,'first_login_password_updated','profile',p_staff_id,
    jsonb_build_object('password_changed',true,'old_sessions_blocked',true));
END;
$fn$;
REVOKE ALL ON FUNCTION public.ds_complete_first_login(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ds_complete_first_login(uuid) TO service_role;
