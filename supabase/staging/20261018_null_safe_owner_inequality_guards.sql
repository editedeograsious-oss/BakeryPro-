-- Staging-only hardening: owner/staff inequality predicates must reject
-- missing current_staff_role() (PostgreSQL NULL <> 'owner' is not TRUE).
DO $g$ BEGIN IF (SELECT environment_mode FROM public.system_environment_config WHERE id=1)
 IS DISTINCT FROM 'staging' THEN RAISE EXCEPTION 'Staging only'; END IF; END $g$;
DO $fix$
DECLARE fn record; old_ddl text; patched_ddl text; changed integer:=0;
BEGIN
 FOR fn IN
 SELECT p.oid,pg_get_functiondef(p.oid) ddl FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prosecdef
 AND has_function_privilege('authenticated',p.oid,'EXECUTE')
 AND (pg_get_functiondef(p.oid) ~* 'public[.]current_staff_role[(][)][[:space:]]*(<>|!=)'
   OR pg_get_functiondef(p.oid) ~* 'v_role[[:space:]]*(<>|!=)')
 ORDER BY p.oid
 LOOP
  old_ddl:=fn.ddl;
  patched_ddl:=regexp_replace(old_ddl,
   'public[.]current_staff_role[(][)][[:space:]]*(<>|!=)',
   'COALESCE(public.current_staff_role()::text,'''') \1','gi');
  patched_ddl:=regexp_replace(patched_ddl,
   'v_role[[:space:]]*(<>|!=)',
   'COALESCE(v_role::text,'''') \1','gi');
  IF patched_ddl<>old_ddl THEN
   INSERT INTO ds_qa_internal.role_guard_original_definitions(signature,original_definition)
   VALUES(fn.oid::regprocedure::text,old_ddl) ON CONFLICT(signature) DO NOTHING;
   EXECUTE patched_ddl;
   changed:=changed+1;
  END IF;
 END LOOP;
 IF changed<20 OR changed>35 THEN RAISE EXCEPTION 'Unexpected inequality hardening count %',changed; END IF;
 RAISE NOTICE 'Staging owner/staff inequality hardening: % function definitions',changed;
END $fix$;
