-- Read-only operator verification. The trusted DB connection is already privileged;
-- selecting the existing active Owner allows the application's guarded read RPC.
-- This never signs into the website or changes an authentication session.
begin isolation level repeatable read read only;
do $capture$
declare owner_id uuid; relation record; counts jsonb := '{}'::jsonb; n bigint;
begin
  select id into owner_id from public.profiles
  where role='owner' and active=true and disabled_at is null order by id limit 1;
  if owner_id is null then raise exception 'An active Owner is required'; end if;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  if exists(select 1 from public.production_cutover_state where id=1 and operations_enabled) then
    raise exception 'Live operations must remain disabled during this recovery drill';
  end if;
  if exists(select 1 from public.system_environment_config where id=1 and environment_mode='production' and not production_lock) then
    raise exception 'Production Lock must remain ON';
  end if;
  for relation in select c.relname from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
    where ns.nspname='public' and c.relkind in ('r','p') order by c.relname
  loop
    execute format('select count(*) from public.%I',relation.relname) into n;
    counts := counts || jsonb_build_object(relation.relname,n);
  end loop;
  perform set_config('ds_bakery.recovery_table_counts',counts::text,true);
end;
$capture$;
select jsonb_build_object(
  'format_version',1,
  'manifest',public.recovery_verification_manifest(),
  'table_counts',current_setting('ds_bakery.recovery_table_counts')::jsonb,
  'auth_user_count',(select count(*) from auth.users),
  'guards',(select jsonb_build_object('environment_mode',e.environment_mode,'production_lock',e.production_lock,'operations_enabled',c.operations_enabled)
    from public.system_environment_config e cross join public.production_cutover_state c where e.id=1 and c.id=1),
  'migrations',(select coalesce(jsonb_agg(jsonb_build_object('version',version,'name',name) order by version),'[]'::jsonb) from supabase_migrations.schema_migrations),
  'public_security',(select coalesce(jsonb_agg(jsonb_build_object('table',c.relname,'rls',c.relrowsecurity,'forced',c.relforcerowsecurity) order by c.relname),'[]'::jsonb)
    from pg_class c join pg_namespace ns on ns.oid=c.relnamespace where ns.nspname='public' and c.relkind in ('r','p')),
  'raw_material_stock',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'quantity',current_stock_qty) order by id),'[]'::jsonb) from public.raw_materials)
);
rollback;
