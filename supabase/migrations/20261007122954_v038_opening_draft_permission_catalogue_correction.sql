-- The installed catalogue uses role-based raw-material reading and inventory:write.
-- Do not require the unregistered inventory:read key.
alter policy opening_drafts_owner_manager_read on public.opening_balance_drafts
using (public.current_staff_role() in ('owner','manager') and
  (kind<>'customer_credit' or public.staff_has_permission('credit:read')));

do $permissions$
declare v_name text; v_definition text;
begin
  foreach v_name in array array['opening_draft_setup_status','save_opening_balance_draft','set_opening_draft_voided'] loop
    select pg_get_functiondef(p.oid) into strict v_definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=v_name;
    if position('public.staff_has_permission(''credit:manage'')' in v_definition)=0
        or position('public.staff_has_permission(''inventory:write'')' in v_definition)=0 then
      raise exception 'Unexpected opening RPC implementation: %',v_name;
    end if;
    v_definition:=replace(v_definition,
      '(public.staff_has_permission(''inventory:write'') and public.staff_has_permission(''inventory:read''))',
      'public.staff_has_permission(''inventory:write'')');
    v_definition:=replace(v_definition,
      '(public.staff_has_permission(''credit:manage'') and public.staff_has_permission(''credit:read''))',
      'public.staff_has_permission(''credit:manage'')');
    v_definition:=replace(v_definition,'public.staff_has_permission(''credit:manage'')',
      '(public.staff_has_permission(''credit:manage'') and public.staff_has_permission(''credit:read''))');
    execute v_definition;
  end loop;
end $permissions$;
notify pgrst, 'reload schema';
