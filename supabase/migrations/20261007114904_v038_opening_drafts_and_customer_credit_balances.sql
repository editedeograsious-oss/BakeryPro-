-- Preparation only: these drafts cannot post stock, sales, credit or cash.
-- Normal credit transactions must obey the same gate as sales and inventory.
create trigger trg_business_operation_gate_customer_credit_ledger
before insert or update or delete on public.customer_credit_ledger
for each row execute function public.trg_business_operation_gate();

create trigger trg_business_operation_gate_customer_credit_allocations
before insert or update or delete on public.customer_credit_allocations
for each row execute function public.trg_business_operation_gate();

create table public.opening_balance_drafts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('raw_material','finished_goods','customer_credit')),
  raw_material_id uuid unique references public.raw_materials(id) on delete restrict,
  product_id uuid unique references public.products(id) on delete restrict,
  customer_id uuid unique references public.customers(id) on delete restrict,
  as_of_date date not null,
  base_unit text,
  quantity numeric(18,6),
  unit_cost numeric(14,6),
  balance_due numeric(14,2),
  due_date date,
  reference text,
  notes text,
  client_request_id uuid not null unique,
  version integer not null default 1 check (version > 0),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles(id),
  void_reason text,
  constraint opening_draft_subject check (
    (kind='raw_material' and raw_material_id is not null and product_id is null and customer_id is null)
    or (kind='finished_goods' and product_id is not null and raw_material_id is null and customer_id is null)
    or (kind='customer_credit' and customer_id is not null and raw_material_id is null and product_id is null)
  ),
  constraint opening_draft_amounts check (
    (kind='customer_credit' and balance_due is not null and balance_due > 0 and balance_due <> 'NaN'::numeric
      and quantity is null and unit_cost is null and base_unit is null)
    or (kind in ('raw_material','finished_goods') and quantity is not null and quantity > 0 and quantity <> 'NaN'::numeric
      and unit_cost is not null and unit_cost >= 0 and unit_cost <> 'NaN'::numeric and balance_due is null
      and coalesce(trim(base_unit),'')<>'' and due_date is null)
  ),
  constraint opening_draft_void_state check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and voided_by is not null and coalesce(trim(void_reason),'')<>'')
  )
);

comment on table public.opening_balance_drafts is
'Unposted opening stock and pre-existing customer debts. Never included in live stock, receivables, sales or cash; reviewed before an explicitly authorized cutover.';

alter table public.opening_balance_drafts enable row level security;
revoke all on public.opening_balance_drafts from public, anon, authenticated;
grant select on public.opening_balance_drafts to authenticated;
create policy opening_drafts_owner_manager_read on public.opening_balance_drafts
for select to authenticated using (public.current_staff_role() in ('owner','manager'));

create function public.assert_opening_drafts_editable()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_env public.system_environment_config%rowtype;
  v_cut public.production_cutover_state%rowtype;
  v_setup public.go_live_setup_state%rowtype;
begin
  if auth.uid() is null or coalesce(public.current_staff_role()::text,'') not in ('owner','manager') then
    raise exception 'Only an active Owner or Manager can prepare opening balances';
  end if;
  -- Freeze edits consistently with a simultaneous setup completion or cutover.
  select * into v_env from public.system_environment_config where id=1 for share;
  select * into v_cut from public.production_cutover_state where id=1 for share;
  select * into v_setup from public.go_live_setup_state where id=1 for share;
  if v_cut.id is null or v_setup.id is null then
    raise exception 'Opening setup and cutover controls are missing';
  end if;
  if v_env.environment_mode is null or v_env.environment_mode not in ('staging','production') then
    raise exception 'Configure the environment before preparing opening balances';
  end if;
  if v_env.environment_mode='production' and not coalesce(v_env.production_lock,false) then
    raise exception 'Production Lock must remain on';
  end if;
  if coalesce(v_cut.operations_enabled,true) or v_cut.authorized_at is not null
      or v_setup.completed_at is not null then
    raise exception 'Opening drafts are closed after go-live setup or cutover';
  end if;
end;
$$;
revoke all on function public.assert_opening_drafts_editable() from public, anon, authenticated;

create function public.opening_draft_setup_status()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_editable boolean := true; v_reason text;
begin
  if auth.uid() is null or coalesce(public.current_staff_role()::text,'') not in ('owner','manager') then
    raise exception 'Only an active Owner or Manager can view opening setup';
  end if;
  begin
    perform public.assert_opening_drafts_editable();
  exception when raise_exception then v_editable := false; v_reason := sqlerrm;
  end;
  return jsonb_build_object('editable',v_editable,'reason',v_reason,
    'business_date',public.business_current_date(),
    'can_prepare_stock',public.staff_has_permission('inventory:write'),
    'can_prepare_credit',public.staff_has_permission('credit:manage'));
end;
$$;
revoke all on function public.opening_draft_setup_status() from public, anon;
grant execute on function public.opening_draft_setup_status() to authenticated;

create function public.save_opening_balance_draft(
  p_draft_id uuid, p_kind text, p_subject_id uuid, p_as_of_date date,
  p_quantity numeric, p_unit_cost numeric, p_balance_due numeric, p_due_date date,
  p_reference text, p_notes text, p_client_request_id uuid, p_expected_version integer
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_old public.opening_balance_drafts%rowtype;
  v_retry public.opening_balance_drafts%rowtype;
  v_id uuid := coalesce(p_draft_id,gen_random_uuid());
  v_unit text;
begin
  perform public.assert_opening_drafts_editable();
  if p_kind is null or p_kind not in ('raw_material','finished_goods','customer_credit')
      or p_subject_id is null or p_as_of_date is null or p_client_request_id is null then
    raise exception 'Choose an item or customer, an opening date and a request ID';
  end if;
  if p_as_of_date > public.business_current_date() then raise exception 'Opening date cannot be in the future'; end if;
  if length(coalesce(p_reference,''))>200 or length(coalesce(p_notes,''))>3000 then
    raise exception 'Reference or notes are too long';
  end if;
  if p_kind='customer_credit' then
    if not coalesce(public.staff_has_permission('credit:manage'),false) then raise exception 'Not authorized to prepare customer credit'; end if;
    if p_balance_due is null or p_balance_due<=0 or p_balance_due::text in ('NaN','Infinity','-Infinity')
        or p_quantity is not null or p_unit_cost is not null then
      raise exception 'Enter the positive amount still owed; stock quantities and costs do not apply';
    end if;
    perform 1 from public.customers where id=p_subject_id and active for share;
    if not found then raise exception 'Active customer not found'; end if;
  else
    if not coalesce(public.staff_has_permission('inventory:write'),false) then raise exception 'Not authorized to prepare opening stock'; end if;
    if p_quantity is null or p_quantity<=0 or p_quantity::text in ('NaN','Infinity','-Infinity')
        or p_unit_cost is null or p_unit_cost<0 or p_unit_cost::text in ('NaN','Infinity','-Infinity')
        or p_balance_due is not null or p_due_date is not null then
      raise exception 'Enter a positive quantity and a non-negative unit cost; customer debt fields do not apply';
    end if;
    if p_kind='raw_material' then
      select base_unit into v_unit from public.raw_materials where id=p_subject_id and status='active' for share;
    else
      select 'pcs' into v_unit from public.products where id=p_subject_id and status='active' for share;
      if p_quantity<>trunc(p_quantity) then raise exception 'Finished goods quantities must be whole pieces'; end if;
    end if;
    if not found or v_unit is null then raise exception 'Active stock item not found'; end if;
  end if;
  select * into v_retry from public.opening_balance_drafts where client_request_id=p_client_request_id for update;
  if found then
    if (p_draft_id is not null and p_draft_id<>v_retry.id) or v_retry.kind<>p_kind
        or coalesce(v_retry.raw_material_id,v_retry.product_id,v_retry.customer_id)<>p_subject_id
        or v_retry.as_of_date<>p_as_of_date
        or v_retry.quantity is distinct from round(p_quantity,6)
        or v_retry.unit_cost is distinct from round(p_unit_cost,6)
        or v_retry.balance_due is distinct from round(p_balance_due,2)
        or v_retry.due_date is distinct from p_due_date
        or v_retry.reference is distinct from nullif(trim(p_reference),'')
        or v_retry.notes is distinct from nullif(trim(p_notes),'') then
      raise exception 'Request ID was already used for different opening information';
    end if;
    return v_retry.id;
  end if;
  if p_draft_id is not null then
    select * into v_old from public.opening_balance_drafts where id=p_draft_id for update;
    if not found then raise exception 'Opening draft not found'; end if;
    if v_old.voided_at is not null then raise exception 'Restore this opening draft before editing it'; end if;
    if p_expected_version is null or v_old.version<>p_expected_version then
      raise exception 'This draft changed. Refresh the page before editing it';
    end if;
    if v_old.kind<>p_kind or coalesce(v_old.raw_material_id,v_old.product_id,v_old.customer_id)<>p_subject_id then
      raise exception 'An opening draft cannot be reassigned to another item or customer';
    end if;
    update public.opening_balance_drafts set as_of_date=p_as_of_date,base_unit=v_unit,
      quantity=p_quantity,unit_cost=p_unit_cost,balance_due=p_balance_due,due_date=p_due_date,
      reference=nullif(trim(p_reference),''),notes=nullif(trim(p_notes),''),
      client_request_id=p_client_request_id,version=version+1,updated_by=auth.uid(),updated_at=now()
    where id=p_draft_id;
  else
    if exists (select 1 from public.opening_balance_drafts
      where raw_material_id=p_subject_id or product_id=p_subject_id or customer_id=p_subject_id) then
      raise exception 'This item or customer already has an opening draft. Edit or restore that draft';
    end if;
    insert into public.opening_balance_drafts(id,kind,raw_material_id,product_id,customer_id,
      as_of_date,base_unit,quantity,unit_cost,balance_due,due_date,reference,notes,
      client_request_id,created_by,updated_by)
    values(v_id,p_kind,case when p_kind='raw_material' then p_subject_id end,
      case when p_kind='finished_goods' then p_subject_id end,case when p_kind='customer_credit' then p_subject_id end,
      p_as_of_date,v_unit,p_quantity,p_unit_cost,p_balance_due,p_due_date,nullif(trim(p_reference),''),
      nullif(trim(p_notes),''),p_client_request_id,auth.uid(),auth.uid());
  end if;
  insert into public.audit_logs(actor_id,action,entity,entity_id,before_data,after_data)
  select auth.uid(),case when p_draft_id is null then 'create_opening_draft' else 'edit_opening_draft' end,
    'opening_balance_draft',v_id,case when p_draft_id is not null then to_jsonb(v_old) end,to_jsonb(d)
  from public.opening_balance_drafts d where id=v_id;
  return v_id;
end;
$$;
revoke all on function public.save_opening_balance_draft(uuid,text,uuid,date,numeric,numeric,numeric,date,text,text,uuid,integer) from public, anon;
grant execute on function public.save_opening_balance_draft(uuid,text,uuid,date,numeric,numeric,numeric,date,text,text,uuid,integer) to authenticated;

create function public.set_opening_draft_voided(p_draft_id uuid,p_voided boolean,p_reason text,p_expected_version integer)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old public.opening_balance_drafts%rowtype;
begin
  perform public.assert_opening_drafts_editable();
  if p_voided is null or coalesce(trim(p_reason),'')='' or length(p_reason)>3000 then
    raise exception 'Specify Void or Restore and a reason';
  end if;
  select * into v_old from public.opening_balance_drafts where id=p_draft_id for update;
  if not found then raise exception 'Opening draft not found'; end if;
  if v_old.kind='customer_credit' and not coalesce(public.staff_has_permission('credit:manage'),false)
      or v_old.kind<>'customer_credit' and not coalesce(public.staff_has_permission('inventory:write'),false) then
    raise exception 'Not authorized to correct this opening draft';
  end if;
  if (v_old.voided_at is not null)=p_voided then return; end if;
  if p_expected_version is null or v_old.version<>p_expected_version then
    raise exception 'This draft changed. Refresh the page before correcting it';
  end if;
  update public.opening_balance_drafts set
    voided_at=case when p_voided then now() end,
    voided_by=case when p_voided then auth.uid() end,
    void_reason=case when p_voided then trim(p_reason) end,
    version=version+1,updated_by=auth.uid(),updated_at=now()
  where id=p_draft_id;
  insert into public.audit_logs(actor_id,action,entity,entity_id,before_data,after_data)
  select auth.uid(),case when p_voided then 'void_opening_draft' else 'restore_opening_draft' end,
    'opening_balance_draft',p_draft_id,to_jsonb(v_old),to_jsonb(d)||jsonb_build_object('correction_reason',trim(p_reason))
  from public.opening_balance_drafts d where id=p_draft_id;
end;
$$;
revoke all on function public.set_opening_draft_voided(uuid,boolean,text,integer) from public, anon;
grant execute on function public.set_opening_draft_voided(uuid,boolean,text,integer) to authenticated;

-- Preserve the existing order-only columns for other modules; append credit and total.
create or replace view public.customer_summary with (security_invoker=true) as
with order_stats as (
  select c.id as customer_id,
    count(co.id) filter (where co.status<>'cancelled') as order_count,
    coalesce(sum(co.total_amount) filter (where co.status<>'cancelled'),0)::numeric(14,2) as total_order_value,
    coalesce(sum(case when co.status<>'cancelled' then co.total_amount-public.customer_order_net_paid(co.id) else 0 end),0)::numeric(14,2) as outstanding_balance,
    max(co.created_at) filter (where co.status<>'cancelled') as last_order_at
  from public.customers c left join public.customer_orders co on co.customer_id=c.id group by c.id
), credit_activity as (
  select customer_id,max(created_at) as last_credit_at from public.customer_credit_ledger group by customer_id
)
select c.id as customer_id,c.full_name,c.phone,c.email,
  coalesce(os.order_count,0) as order_count,
  coalesce(os.total_order_value,0)::numeric(14,2) as total_order_value,
  coalesce(os.outstanding_balance,0)::numeric(14,2) as outstanding_balance,
  os.last_order_at,c.address,c.birthday,c.notes,c.whatsapp_opt_in,
  case when public.staff_has_permission('credit:read') then coalesce(cs.balance_due,0)::numeric(14,2) end as credit_balance_due,
  case when public.staff_has_permission('credit:read') then
    (greatest(coalesce(os.outstanding_balance,0),0)+coalesce(cs.balance_due,0))::numeric(14,2) end as total_outstanding_balance,
  ca.last_credit_at
from public.customers c
left join order_stats os on os.customer_id=c.id
left join public.customer_credit_summary cs on cs.customer_id=c.id
left join credit_activity ca on ca.customer_id=c.id
where c.active;

-- Go-live completion must not overlook unposted opening information.
CREATE OR REPLACE FUNCTION public.go_live_setup_readiness()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_state public.go_live_setup_state%rowtype;
  v_env public.system_environment_config%rowtype;
  v_release public.system_release_state%rowtype;
  v_owner_count bigint;
  v_product_count bigint;
  v_material_count bigint;
  v_recipe_gap bigint;
  v_supplier_count bigint;
  v_staff_count bigint;
  v_negative_stock bigint;
  v_opening_drafts bigint;
  v_public_ok boolean;
  v_validation_pass boolean;
  v_auto_pass boolean;
  v_manual_pass boolean;
begin
  if auth.uid() is null or coalesce(public.current_staff_role()::text,'') not in ('owner','manager') then
    raise exception 'Owner or manager access required';
  end if;

  select * into v_state from public.go_live_setup_state where id=1;
  select * into v_env from public.system_environment_config where id=1;
  select * into v_release from public.system_release_state where id=1;

  select count(*) into v_owner_count
  from public.profiles
  where active=true and disabled_at is null and role='owner';

  select count(*) into v_staff_count
  from public.profiles
  where active=true and disabled_at is null;

  select count(*) into v_product_count
  from public.products
  where status='active' and selling_price>0;

  select count(*) into v_material_count
  from public.raw_materials
  where status='active';

  select count(*) into v_supplier_count
  from public.suppliers
  where active=true;

  select count(*) into v_negative_stock
  from public.raw_materials
  where current_stock_qty<0;

  select count(*) into v_recipe_gap
  from public.products p
  where p.status='active'
    and p.track_recipe=true
    and not exists(
      select 1 from public.recipes r
      where r.product_id=p.id and r.active=true
    );

  select exists(
    select 1
    from public.public_site_settings
    where id=1
      and coalesce(trim(business_name),'')<>''
      and coalesce(trim(phone),'')<>''
      and coalesce(trim(whatsapp_phone),'')<>''
      and coalesce(trim(address_text),'')<>''
  ) into v_public_ok;

  select exists(
    select 1
    from public.validation_runs vr
    where vr.environment='staging'
      and vr.overall_status='pass'
      and vr.completed_at is not null
      and vr.app_version=v_release.app_version
      and vr.latest_migration=v_release.latest_migration
  ) into v_validation_pass;

  select count(*) into v_opening_drafts from public.opening_balance_drafts where voided_at is null;

  v_auto_pass :=
    v_owner_count>=1
    and v_staff_count>=1
    and v_product_count>=1
    and v_material_count>=1
    and v_supplier_count>=1
    and v_negative_stock=0
    and v_recipe_gap=0
    and v_opening_drafts=0
    and v_public_ok
    and v_env.environment_mode<>'unconfigured';

  v_manual_pass :=
    v_state.catalog_verified
    and v_state.opening_stock_verified
    and v_state.payment_methods_verified
    and v_state.public_site_verified
    and v_state.staff_accounts_verified
    and v_state.backup_plan_verified;

  return jsonb_build_object(
    'environment_mode',v_env.environment_mode,
    'production_lock',v_env.production_lock,
    'automatic',jsonb_build_object(
      'active_owner',v_owner_count>=1,
      'active_staff_count',v_staff_count,
      'active_products',v_product_count,
      'active_raw_materials',v_material_count,
      'active_suppliers',v_supplier_count,
      'negative_stock_count',v_negative_stock,
      'recipe_gap_count',v_recipe_gap,
      'unposted_opening_drafts',v_opening_drafts,
      'public_site_contact_ready',v_public_ok,
      'passing_staging_validation',v_validation_pass
    ),
    'manual',jsonb_build_object(
      'catalog_verified',v_state.catalog_verified,
      'opening_stock_verified',v_state.opening_stock_verified,
      'payment_methods_verified',v_state.payment_methods_verified,
      'public_site_verified',v_state.public_site_verified,
      'staff_accounts_verified',v_state.staff_accounts_verified,
      'backup_plan_verified',v_state.backup_plan_verified
    ),
    'automatic_gate',case when v_auto_pass then 'pass' else 'fail' end,
    'manual_gate',case when v_manual_pass then 'pass' else 'fail' end,
    'staging_validation_gate',case when v_validation_pass then 'pass' else 'warn' end,
    'setup_completed',v_state.completed_at is not null,
    'completed_at',v_state.completed_at,
    'notes',v_state.notes
  );
end;
$function$;

notify pgrst, 'reload schema';
