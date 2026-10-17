-- STAGING v0.38: fail-closed permissions, view-only catalogue and trusted
-- first-password-change completion. Production is intentionally excluded.
DO $guard$ BEGIN
  IF (SELECT environment_mode FROM public.system_environment_config WHERE id=1) IS DISTINCT FROM 'staging'
  THEN RAISE EXCEPTION 'STAGING ONLY'; END IF;
END $guard$;

INSERT INTO public.role_permission_defaults(role,permission_key,allowed)
SELECT 'viewer'::public.staff_role, ap.permission_key, false
FROM public.app_permissions ap
ON CONFLICT (role,permission_key) DO NOTHING;

-- A pending temporary password grants no operational DB privileges.
CREATE OR REPLACE FUNCTION public.current_staff_role()
RETURNS public.staff_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
 SELECT p.role FROM public.profiles p
 WHERE p.id=auth.uid() AND p.active=true AND p.disabled_at IS NULL
   AND p.require_password_reset=false
$fn$;

CREATE OR REPLACE FUNCTION public.is_active_staff()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
 SELECT EXISTS(
  SELECT 1 FROM public.profiles p
  WHERE p.id=auth.uid() AND p.active=true AND p.disabled_at IS NULL
    AND p.require_password_reset=false
 )
$fn$;

-- Viewer roles cannot be upgraded by individual permission overrides.
-- Also fail closed for suspended and temporary-password staff.
CREATE OR REPLACE FUNCTION public.staff_has_permission(p_permission_key text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
 SELECT COALESCE((
   SELECT e.effective_allowed
   FROM public.profiles p
   JOIN public.effective_staff_permissions(auth.uid()) e ON TRUE
   WHERE p.id=auth.uid() AND p.active=true
     AND p.disabled_at IS NULL AND p.require_password_reset=false
     AND p.role <> 'viewer'::public.staff_role
     AND e.permission_key=p_permission_key
 ),false)
$fn$;

-- Viewer receives safe catalogue and availability only.
-- Prices are public retail prices. Batch costs, payroll and customer PII are
-- never returned to the account.
CREATE OR REPLACE FUNCTION public.viewer_product_stock()
RETURNS TABLE(product_id uuid, name text, selling_price numeric, available_qty numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public, pg_temp
AS $fn$
BEGIN
 IF public.current_staff_role() <> 'viewer'::public.staff_role
    OR public.current_staff_role() IS NULL THEN
   RAISE EXCEPTION 'View-only staff authorization required' USING ERRCODE='42501';
 END IF;
 RETURN QUERY
 SELECT p.id,p.name,p.selling_price,
   COALESCE(SUM(GREATEST(COALESCE(b.quantity_available,0),0)),0)::numeric
 FROM public.products p
 LEFT JOIN public.finished_goods_batches b
   ON b.product_id=p.id AND b.quantity_available>0
 WHERE p.status='active'::public.record_status
 GROUP BY p.id,p.name,p.selling_price ORDER BY p.name;
END
$fn$;
REVOKE ALL ON FUNCTION public.viewer_product_stock() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.viewer_product_stock() TO authenticated;

-- Sensitive finance module revisions are invisible to non-management staff;
-- viewers see ONLY catalogue and inventory update metadata.
DROP POLICY IF EXISTS "active staff read safe sync revision" ON public.ds_sync_revision;
CREATE POLICY "active staff read safe sync revision" ON public.ds_sync_revision
 FOR SELECT TO authenticated USING (
 public.is_active_staff() AND (
   (public.current_staff_role()='viewer'::public.staff_role
     AND module IN ('catalog','inventory'))
   OR
   (public.current_staff_role() <> 'viewer'::public.staff_role
     AND (module<>'finance' OR public.current_staff_role() IN ('owner','manager')))
 ));

-- Admin-only atomic profile-activation and audit. Calling this function does
-- not change the password. Only the trusted Edge service may call it AFTER
-- Supabase Auth admin.updateUserById has successfully changed the password.
CREATE OR REPLACE FUNCTION public.ds_complete_first_login(p_staff_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public, pg_temp
AS $fn$
DECLARE v_old boolean;
BEGIN
 UPDATE public.profiles
 SET require_password_reset=false, session_version=session_version+1,
     updated_at=clock_timestamp()
 WHERE id=p_staff_id AND active=true AND disabled_at IS NULL
   AND role<>'owner'::public.staff_role AND require_password_reset=true
 RETURNING true INTO v_old;
 IF v_old IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Pending active staff password change not found' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.audit_logs(actor_id,action,entity,entity_id,after_data)
 VALUES (p_staff_id,'first_login_password_updated','profile',p_staff_id,
         jsonb_build_object('password_changed',true));
END;
$fn$;
REVOKE ALL ON FUNCTION public.ds_complete_first_login(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ds_complete_first_login(uuid) TO service_role;
