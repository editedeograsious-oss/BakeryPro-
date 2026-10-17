-- DS Bakery v0.38: extend STAGING-only staff enum; no users are modified.
DO $guard$ BEGIN
  IF (SELECT environment_mode FROM public.system_environment_config WHERE id=1) IS DISTINCT FROM 'staging'
  THEN RAISE EXCEPTION 'Refusing to alter a non-staging environment'; END IF;
END $guard$;
ALTER TYPE public.staff_role ADD VALUE IF NOT EXISTS 'viewer';
