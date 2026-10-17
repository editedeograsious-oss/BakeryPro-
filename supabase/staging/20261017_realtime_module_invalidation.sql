-- Staging-only non-sensitive, commit-atomic UI cache invalidation.
-- Each trigger fires once per SQL statement and rolls back with its source write.
-- Realtime delivers module+revision only; business records remain guarded by RLS.
do $guard$ begin
  if (select environment_mode from public.system_environment_config where id=1) is distinct from 'staging' then
    raise exception 'Staging only: DS Bakery sync signal installation refused';
  end if;
end $guard$;

create table if not exists public.ds_sync_revision (
  module text primary key check (module in ('sales','catalog','inventory','orders','purchases','production','finance','staff')),
  revision bigint not null default 0 check (revision >= 0),
  changed_at timestamptz not null default now()
);
alter table public.ds_sync_revision enable row level security;
revoke all on table public.ds_sync_revision from public, anon, authenticated;
grant select on table public.ds_sync_revision to authenticated;
drop policy if exists "active staff read safe sync revision" on public.ds_sync_revision;
create policy "active staff read safe sync revision" on public.ds_sync_revision
 for select to authenticated
 using (public.is_active_staff()
   and (module <> 'finance' or public.current_staff_role() in ('owner','manager')));
insert into public.ds_sync_revision(module,revision) values
 ('sales',0),('catalog',0),('inventory',0),('orders',0),
 ('purchases',0),('production',0),('finance',0),('staff',0)
on conflict(module) do nothing;

create or replace function public.ds_touch_sync_revision()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $fn$
begin
  insert into public.ds_sync_revision(module, revision,changed_at)
  values (TG_ARGV[0],1,clock_timestamp())
  on conflict(module) do update
   set revision=public.ds_sync_revision.revision+1,
       changed_at=excluded.changed_at;
  return null;
end;
$fn$;
revoke execute on function public.ds_touch_sync_revision() from public,anon,authenticated;
do $install$
declare r record;
begin
  for r in select * from (values
    ('sales','sales'),
    ('sale_items','sales'),
    ('payments','sales'),
    ('sale_refunds','sales'),
    ('cashier_shifts','sales'),
    ('products','catalog'),
    ('product_categories','catalog'),
    ('recipes','catalog'),
    ('recipe_items','catalog'),
    ('promotions','catalog'),
    ('promotion_products','catalog'),
    ('product_cost_profiles','catalog'),
    ('raw_materials','inventory'),
    ('inventory_transactions','inventory'),
    ('finished_goods_batches','inventory'),
    ('sale_batch_allocations','inventory'),
    ('customer_order_batch_allocations','inventory'),
    ('finished_goods_waste_allocations','inventory'),
    ('customer_orders','orders'),
    ('customer_order_items','orders'),
    ('customer_order_payments','orders'),
    ('customer_order_refunds','orders'),
    ('custom_cake_specs','orders'),
    ('delivery_jobs','orders'),
    ('purchases','purchases'),
    ('purchase_items','purchases'),
    ('purchase_payments','purchases'),
    ('purchase_receipt_events','purchases'),
    ('suppliers','purchases'),
    ('production_plan_items','production'),
    ('production_runs','production'),
    ('production_consumptions','production'),
    ('baker_tasks','production'),
    ('waste_events','production'),
    ('expenses','finance'),
    ('cash_movements','finance'),
    ('daily_closings','finance'),
    ('money_account_entries','finance'),
    ('money_accounts','finance'),
    ('money_reconciliations','finance'),
    ('customer_credit_ledger','finance'),
    ('customer_credit_allocations','finance'),
    ('payroll_runs','finance'),
    ('payroll_items','finance'),
    ('salary_advances','finance'),
    ('payroll_advance_allocations','finance'),
    ('profiles','staff'),
    ('staff_permission_overrides','staff'),
    ('staff_work_shifts','staff'),
    ('attendance_records','staff')
  ) as t(table_name,module_name)
  loop
    if to_regclass(format('public.%I',r.table_name)) is null then
      raise exception 'Expected staging table missing: %',r.table_name;
    end if;
    execute format('drop trigger if exists ds_sync_signal on public.%I',r.table_name);
    execute format('create trigger ds_sync_signal after insert or update or delete on public.%I for each statement execute function public.ds_touch_sync_revision(%L)',r.table_name,r.module_name);
  end loop;
end $install$;
do $publication$
begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='ds_sync_revision') then
   alter publication supabase_realtime add table public.ds_sync_revision;
 end if;
end $publication$;
