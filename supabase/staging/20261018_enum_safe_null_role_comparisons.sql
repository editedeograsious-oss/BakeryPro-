-- Staging-only compatibility fix: IS DISTINCT FROM is NULL-safe and
-- preserves staff_role enum typing, unlike a text COALESCE comparison.
DO $g$ BEGIN IF (SELECT environment_mode FROM public.system_environment_config WHERE id=1)
 IS DISTINCT FROM 'staging' THEN RAISE EXCEPTION 'Staging only'; END IF; END $g$;
DO $fix$
DECLARE fn record; old_ddl text; corrected text; count_fixed integer:=0;
BEGIN
 FOR fn IN
  SELECT p.oid,pg_get_functiondef(p.oid) ddl
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prosecdef
  AND has_function_privilege('authenticated',p.oid,'EXECUTE')
  AND (pg_get_functiondef(p.oid) ~* $pat$COALESCE\(public\.current_staff_role\(\)::text,''\)[[:space:]]*(<>|!=)$pat$
    OR pg_get_functiondef(p.oid) ~* $pat$COALESCE\(v_role::text,''\)[[:space:]]*(<>|!=)$pat$)
  ORDER BY p.oid
 LOOP
  old_ddl:=fn.ddl;
  corrected:=regexp_replace(old_ddl,
    $pat$COALESCE\(public\.current_staff_role\(\)::text,''\)[[:space:]]*(<>|!=)$pat$,
    'public.current_staff_role() IS DISTINCT FROM','gi');
  corrected:=regexp_replace(corrected,
    $pat$COALESCE\(v_role::text,''\)[[:space:]]*(<>|!=)$pat$,
    'v_role IS DISTINCT FROM','gi');
  IF corrected <> old_ddl THEN
   EXECUTE corrected;
   count_fixed:=count_fixed+1;
  END IF;
 END LOOP;
 IF count_fixed<20 OR count_fixed>35 THEN RAISE EXCEPTION 'Expected 20-35 corrected, got %',count_fixed;END IF;
 RAISE NOTICE 'Enum-safe role comparisons corrected in % functions',count_fixed;
END $fix$;
