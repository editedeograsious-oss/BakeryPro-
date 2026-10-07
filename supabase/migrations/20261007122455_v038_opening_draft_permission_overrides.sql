-- Individual permission overrides also apply to opening preparation.
alter policy opening_drafts_owner_manager_read on public.opening_balance_drafts
using (public.current_staff_role() in ('owner','manager') and
  ((kind='customer_credit' and public.staff_has_permission('credit:read'))
    or (kind<>'customer_credit' and public.staff_has_permission('inventory:read'))));

-- Preserve each installed RPC's complete implementation and ACL while adding
-- the read permission alongside its existing write permission.
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
    v_definition:=replace(v_definition,'public.staff_has_permission(''credit:manage'')',
      '(public.staff_has_permission(''credit:manage'') and public.staff_has_permission(''credit:read''))');
    v_definition:=replace(v_definition,'public.staff_has_permission(''inventory:write'')',
      '(public.staff_has_permission(''inventory:write'') and public.staff_has_permission(''inventory:read''))');
    execute v_definition;
  end loop;
end $permissions$;
notify pgrst, 'reload schema';
