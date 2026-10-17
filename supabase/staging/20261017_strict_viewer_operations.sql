-- STAGING ONLY. Complete the viewer read-only isolation against attendance,
-- profile and notification mutation paths without altering regular staff access.
DO $guard$ BEGIN
  IF (SELECT environment_mode FROM public.system_environment_config WHERE id=1) IS DISTINCT FROM 'staging'
  THEN RAISE EXCEPTION 'Refusing to change non-staging database'; END IF;
END $guard$;

CREATE OR REPLACE FUNCTION public.is_active_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO public, pg_temp AS $fn$
 SELECT EXISTS(
   SELECT 1 FROM public.profiles p
   WHERE p.id=auth.uid() AND p.active=true AND p.disabled_at IS NULL
     AND p.require_password_reset=false AND p.role <> 'viewer'::public.staff_role
 );
$fn$;

CREATE OR REPLACE FUNCTION public.is_active_viewer()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO public, pg_temp AS $fn$
 SELECT EXISTS(
   SELECT 1 FROM public.profiles p
   WHERE p.id=auth.uid() AND p.active=true AND p.disabled_at IS NULL
     AND p.require_password_reset=false AND p.role = 'viewer'::public.staff_role
 );
$fn$;
REVOKE EXECUTE ON FUNCTION public.is_active_viewer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_viewer() TO authenticated;

DROP POLICY IF EXISTS "active staff read safe sync revision" ON public.ds_sync_revision;
CREATE POLICY "active staff read safe sync revision" ON public.ds_sync_revision
FOR SELECT TO authenticated USING (
   (public.is_active_viewer() AND module IN ('catalog','inventory'))
   OR (
     public.is_active_staff() AND
     (module <> 'finance' OR public.current_staff_role() IN ('owner','manager'))
   )
);

CREATE OR REPLACE FUNCTION public.update_my_profile(p_full_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public, pg_temp AS $fn$
DECLARE v_before jsonb;
BEGIN
 IF NOT public.is_active_staff() THEN RAISE EXCEPTION 'Active operational staff required' USING ERRCODE='42501'; END IF;
 IF coalesce(trim(p_full_name),'')='' THEN RAISE EXCEPTION 'Display name is required'; END IF;
 SELECT to_jsonb(p) INTO v_before FROM public.profiles p WHERE p.id=auth.uid();
 IF v_before IS NULL THEN RAISE EXCEPTION 'Staff profile not found'; END IF;
 UPDATE public.profiles SET full_name=trim(p_full_name),updated_at=now() WHERE id=auth.uid();
 INSERT INTO public.audit_logs(actor_id,action,entity,entity_id,before_data,after_data)
 VALUES(auth.uid(),'update_my_profile','profile',auth.uid(),v_before,
        (SELECT to_jsonb(p) FROM public.profiles p WHERE p.id=auth.uid()));
END;
$fn$;

CREATE OR REPLACE FUNCTION public.clock_out_staff()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public, pg_temp AS $fn$
DECLARE v_record public.attendance_records%rowtype;
BEGIN
 IF NOT public.is_active_staff() THEN RAISE EXCEPTION 'Active operational staff required' USING ERRCODE='42501'; END IF;
 SELECT ar.* INTO v_record
 FROM public.attendance_records ar
 JOIN public.staff_work_shifts sws ON sws.id=ar.shift_id
 WHERE ar.staff_id=auth.uid() AND sws.shift_date=public.business_current_date()
   AND ar.clock_in_at IS NOT NULL AND ar.clock_out_at IS NULL
 ORDER BY ar.clock_in_at DESC LIMIT 1 FOR UPDATE OF ar;
 IF NOT FOUND THEN RAISE EXCEPTION 'No open attendance record found'; END IF;
 UPDATE public.attendance_records SET clock_out_at=now(),status='completed',updated_at=now() WHERE id=v_record.id;
 UPDATE public.staff_work_shifts SET status='completed',updated_at=now() WHERE id=v_record.shift_id;
 INSERT INTO public.audit_logs(actor_id,action,entity,entity_id,after_data)
 VALUES(auth.uid(),'clock_out','attendance_record',v_record.id,jsonb_build_object('clock_out_at',now()));
 RETURN v_record.id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.mark_all_staff_notifications_read()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public, pg_temp AS $fn$
DECLARE count_rows integer;
BEGIN
 IF NOT public.is_active_staff() THEN RAISE EXCEPTION 'Active operational staff required' USING ERRCODE='42501'; END IF;
 UPDATE public.staff_notifications SET read_at=now()
 WHERE recipient_id=auth.uid() AND read_at IS NULL;
 GET DIAGNOSTICS count_rows=ROW_COUNT;
 RETURN count_rows;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.mark_staff_notification_read(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public, pg_temp AS $fn$
BEGIN
 IF NOT public.is_active_staff() THEN RAISE EXCEPTION 'Active operational staff required' USING ERRCODE='42501'; END IF;
 UPDATE public.staff_notifications SET read_at=now()
 WHERE id=p_id AND recipient_id=auth.uid() AND read_at IS NULL;
 RETURN FOUND;
END;
$fn$;
