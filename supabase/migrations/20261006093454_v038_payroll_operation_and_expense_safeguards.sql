-- Extend the existing operation lock to payroll transactions.
do $migration$
declare table_name text; trigger_name text;
begin
  foreach table_name in array array['payroll_runs','payroll_items','salary_advances','payroll_advance_allocations'] loop
    trigger_name := 'trg_business_operation_gate_' || table_name;
    if not exists (select 1 from pg_trigger where tgrelid=format('public.%I',table_name)::regclass and tgname=trigger_name) then
      execute format('create trigger %I before insert or update or delete on public.%I for each row execute function public.trg_business_operation_gate()',trigger_name,table_name);
    end if;
  end loop;
end $migration$;

-- One salary expense belongs to one payroll item.
create unique index if not exists payroll_items_expense_unique
  on public.payroll_items(expense_id) where expense_id is not null;

-- Check the final transaction state so the existing pay/reverse/restore RPCs
-- can update both ledgers atomically, in either order.
create or replace function public.enforce_payroll_expense_consistency()
returns trigger language plpgsql security definer set search_path=public
as $function$
declare
  expense_ids uuid[] := array[]::uuid[];
  expense_id_value uuid;
  expense_row public.expenses%rowtype;
  item_row public.payroll_items%rowtype;
  item_found boolean;
begin
  if tg_table_name='expenses' then
    if tg_op<>'DELETE' then expense_ids:=array_append(expense_ids,new.id); end if;
    if tg_op<>'INSERT' then expense_ids:=array_append(expense_ids,old.id); end if;
  else
    if tg_op<>'DELETE' then
      expense_ids:=array_append(expense_ids,new.expense_id);
      select * into item_row from public.payroll_items where id=new.id;
      if found and item_row.payment_status='paid' and item_row.net_pay>0 and item_row.expense_id is null then
        raise exception 'Paid salary requires its linked Payroll expense' using errcode='23514';
      end if;
    end if;
    if tg_op<>'INSERT' then expense_ids:=array_append(expense_ids,old.expense_id); end if;
  end if;

  for expense_id_value in select distinct value from unnest(expense_ids) value where value is not null loop
    select * into expense_row from public.expenses where id=expense_id_value;
    if not found then
      if exists(select 1 from public.payroll_items where expense_id=expense_id_value) then
        raise exception 'Payroll expense is missing' using errcode='23514';
      end if;
      continue;
    end if;
    select * into item_row from public.payroll_items where expense_id=expense_id_value;
    item_found:=found;
    if not item_found then
      if expense_row.category='Payroll' and expense_row.voided_at is null then
        raise exception 'Use Staff Salaries & Payroll to record or restore salary expenses' using errcode='23514';
      end if;
      continue;
    end if;
    if expense_row.category is distinct from 'Payroll'
       or expense_row.amount is distinct from item_row.net_pay
       or expense_row.payment_method is distinct from item_row.payment_method
       or expense_row.reference is distinct from item_row.payment_reference
       or (item_row.payment_status='paid' and expense_row.voided_at is not null)
       or (item_row.payment_status='void' and expense_row.voided_at is null)
       or item_row.payment_status not in ('paid','void') then
      raise exception 'Correct salary payments from Staff Salaries & Payroll so expenses and advances stay reconciled' using errcode='23514';
    end if;
  end loop;
  return null;
end $function$;

-- Internal trigger helper, never a public RPC.
revoke all on function public.enforce_payroll_expense_consistency() from public,anon,authenticated;

create constraint trigger payroll_expense_consistency
after insert or update or delete on public.expenses
deferrable initially deferred for each row
execute function public.enforce_payroll_expense_consistency();

create constraint trigger payroll_item_expense_consistency
after insert or update or delete on public.payroll_items
deferrable initially deferred for each row
execute function public.enforce_payroll_expense_consistency();
