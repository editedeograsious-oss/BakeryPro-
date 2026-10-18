-- DS Bakery staging-only null-safe authorization patch.
-- PostgreSQL NULL NOT IN (..) evaluates UNKNOWN, so IF does not reject
-- deactivated sessions. Make role allowlists fail closed.
-- Preserve the exact former function DDL in a private schema for rollback.
DO $g$ BEGIN
 IF (SELECT environment_mode FROM public.system_environment_config WHERE id=1)
   IS DISTINCT FROM 'staging' THEN RAISE EXCEPTION 'Refusing non-staging patch'; END IF;
END $g$;

CREATE SCHEMA IF NOT EXISTS ds_qa_internal;
REVOKE ALL ON SCHEMA ds_qa_internal FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS ds_qa_internal.role_guard_original_definitions (
 signature text PRIMARY KEY,
 original_definition text NOT NULL,
 backed_up_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON ds_qa_internal.role_guard_original_definitions FROM PUBLIC,anon,authenticated;

DO $fix$
DECLARE
 fn record;
 original_sql text;
 rewritten_sql text;
 patched_count int:=0;
BEGIN
 FOR fn IN
   SELECT p.oid,pg_get_functiondef(p.oid) AS ddl
   FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.prosecdef
     AND has_function_privilege('authenticated',p.oid,'EXECUTE')
     AND (
       pg_get_functiondef(p.oid) ~* 'public[.]current_staff_role[(][)][[:space:]]+not[[:space:]]+in[[:space:]]*[(]'
       OR pg_get_functiondef(p.oid) ~* 'v_role[[:space:]]+not[[:space:]]+in[[:space:]]*[(]'
     )
   ORDER BY p.oid
 LOOP
   original_sql:=fn.ddl;
   rewritten_sql:=regexp_replace(
     original_sql,
     'public[.]current_staff_role[(][)][[:space:]]+not[[:space:]]+in[[:space:]]*[(]',
     'COALESCE(public.current_staff_role()::text,'''') NOT IN (',
     'gi');
   rewritten_sql:=regexp_replace(
     rewritten_sql,
     'v_role[[:space:]]+not[[:space:]]+in[[:space:]]*[(]',
     'COALESCE(v_role::text,'''') NOT IN (',
     'gi');
   IF rewritten_sql<>original_sql THEN
     INSERT INTO ds_qa_internal.role_guard_original_definitions(signature,original_definition)
       VALUES(fn.oid::regprocedure::text,original_sql)
     ON CONFLICT(signature) DO NOTHING;
     EXECUTE rewritten_sql;
     patched_count:=patched_count+1;
   END IF;
 END LOOP;
 IF patched_count<50 OR patched_count>65 THEN
   RAISE EXCEPTION 'Unexpected role-guard patch coverage: % functions',patched_count;
 END IF;
 RAISE NOTICE 'Staging null-safe staff-role guard patched % security-definer functions',patched_count;
END $fix$;
