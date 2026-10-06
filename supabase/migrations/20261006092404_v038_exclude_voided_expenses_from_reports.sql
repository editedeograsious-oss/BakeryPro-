-- v0.38: exclude voided expenses consistently from reports and dashboard.
CREATE OR REPLACE FUNCTION public.management_report(p_start_date date, p_end_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sales numeric(14,2);
  v_cogs numeric(14,2);
  v_gross numeric(14,2);
  v_expenses numeric(14,2);
  v_purchases numeric(14,2);
  v_transactions bigint;
begin
  if public.current_staff_role() not in ('owner','manager') then
    raise exception 'Not authorized';
  end if;

  if p_end_date < p_start_date then
    raise exception 'Invalid date range';
  end if;

  select
    coalesce(sum(sales_amount),0),
    coalesce(sum(cogs_amount),0),
    coalesce(sum(gross_profit_amount),0)
  into v_sales,v_cogs,v_gross
  from public.sale_profit_lines
  where created_at >= p_start_date
    and created_at < (p_end_date + 1);

  select coalesce(sum(amount),0)
  into v_expenses
  from public.expenses
  where created_at >= p_start_date
    and created_at < (p_end_date + 1)
    and voided_at is null;

  select coalesce(sum(total_amount),0)
  into v_purchases
  from public.purchases
  where purchase_date between p_start_date and p_end_date
    and status <> 'cancelled';

  select count(*)
  into v_transactions
  from public.sales
  where created_at >= p_start_date
    and created_at < (p_end_date + 1)
    and status in ('completed','partially_refunded');

  return jsonb_build_object(
    'start_date',p_start_date,
    'end_date',p_end_date,
    'sales',v_sales,
    'cogs',v_cogs,
    'gross_profit',v_gross,
    'expenses',v_expenses,
    'estimated_operating_profit',v_gross-v_expenses,
    'purchases',v_purchases,
    'transactions',v_transactions
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.management_report_v2(p_period text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_start timestamptz;
  v_end timestamptz:=now();
  v_days integer;
  v_summary jsonb;
  v_products jsonb;
  v_payments jsonb;
  v_expenses jsonb;
begin
  if not public.staff_has_permission('reports:view') then raise exception 'Reports permission required'; end if;
  if p_period='week' then v_days:=7;
  elsif p_period='month' then v_days:=30;
  else raise exception 'Period must be week or month'; end if;
  v_start:=now()-(v_days||' days')::interval;

  select jsonb_build_object(
    'sales',coalesce(sum(s.total-coalesce(s.refund_total,0)),0),
    'cogs',coalesce((select sum(cogs_amount) from public.sale_profit_lines spl where spl.created_at>=v_start and spl.created_at<v_end),0),
    'gross_profit',coalesce((select sum(gross_profit_amount) from public.sale_profit_lines spl where spl.created_at>=v_start and spl.created_at<v_end),0),
    'expenses',coalesce((select sum(amount) from public.expenses e where e.created_at>=v_start and e.created_at<v_end and e.voided_at is null),0),
    'operating_profit',
      coalesce((select sum(gross_profit_amount) from public.sale_profit_lines spl where spl.created_at>=v_start and spl.created_at<v_end),0)
      -coalesce((select sum(amount) from public.expenses e where e.created_at>=v_start and e.created_at<v_end and e.voided_at is null),0),
    'purchases',coalesce((select sum(total_amount) from public.purchases p where p.created_at>=v_start and p.created_at<v_end and p.status<>'cancelled'),0),
    'waste_cost',coalesce((select sum(total_cost) from public.waste_events w where w.recorded_at>=v_start and w.recorded_at<v_end and w.approval_status='approved'),0),
    'transactions',count(*) filter(where s.status in ('completed','partially_refunded','refunded')),
    'customer_order_value',coalesce((select sum(total_amount) from public.customer_orders co where co.created_at>=v_start and co.created_at<v_end and co.status<>'cancelled'),0),
    'customer_order_outstanding',coalesce((select sum(balance_due) from public.customer_order_summary where status<>'cancelled'),0),
    'supplier_outstanding',coalesce((select sum(outstanding_balance) from public.supplier_account_summary),0),
    'supplier_overdue',coalesce((select sum(overdue_balance) from public.supplier_account_summary),0),
    'production_planned',coalesce((select sum(planned_qty) from public.production_plan_items ppi where ppi.business_date>=public.business_current_date()-v_days and ppi.status<>'cancelled'),0),
    'production_produced',coalesce((select sum(produced_qty) from public.production_plan_items ppi where ppi.business_date>=public.business_current_date()-v_days and ppi.status<>'cancelled'),0)
  ) into v_summary
  from public.sales s
  where s.created_at>=v_start and s.created_at<v_end;

  select coalesce(jsonb_agg(x order by x.sales_amount desc),'[]'::jsonb)
  into v_products
  from (
    select product_id,product_name,sum(quantity) units,sum(sales_amount) sales_amount,sum(gross_profit_amount) gross_profit
    from public.sale_profit_lines
    where created_at>=v_start and created_at<v_end
    group by product_id,product_name
    order by sales_amount desc limit 10
  ) x;

  select coalesce(jsonb_agg(x order by x.amount desc),'[]'::jsonb)
  into v_payments
  from (
    select method::text method,sum(amount) amount
    from public.payments
    where created_at>=v_start and created_at<v_end and status='completed'
    group by method
  ) x;

  select coalesce(jsonb_agg(x order by x.amount desc),'[]'::jsonb)
  into v_expenses
  from (
    select category,sum(amount) amount
    from public.expenses
    where created_at>=v_start and created_at<v_end and voided_at is null
    group by category
  ) x;

  return jsonb_build_object('summary',v_summary,'products',v_products,'payments',v_payments,'expenses',v_expenses);
end;
$function$;

CREATE OR REPLACE FUNCTION public.owner_dashboard_summary(p_period text DEFAULT 'day'::text)
 RETURNS TABLE(period_start timestamp with time zone, sales numeric, cash_sales numeric, mtn_momo_sales numeric, airtel_money_sales numeric, gross_profit numeric, expenses numeric, estimated_operating_profit numeric, transaction_count bigint, average_sale numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.current_staff_role() not in ('owner','manager') then
    raise exception 'Not authorized';
  end if;

  return query
  with bounds as (
    select public.period_start(p_period) as start_at
  ),
  sales_summary as (
    select
      coalesce(sum(s.total-coalesce(s.refund_total,0)),0)::numeric(14,2) as sales,
      count(*)::bigint as transaction_count
    from public.sales s,bounds b
    where s.created_at>=b.start_at
      and s.status in ('completed','partially_refunded','refunded')
  ),
  payment_summary as (
    select
      (
        coalesce(sum(case when p.method='cash' then p.amount else 0 end),0) -
        coalesce((select sum(sr.amount) from public.sale_refunds sr,bounds b where sr.method='cash' and sr.refunded_at>=b.start_at),0)
      )::numeric(14,2) as cash_sales,
      (
        coalesce(sum(case when p.method='mtn_momo' then p.amount else 0 end),0) -
        coalesce((select sum(sr.amount) from public.sale_refunds sr,bounds b where sr.method='mtn_momo' and sr.refunded_at>=b.start_at),0)
      )::numeric(14,2) as mtn_momo_sales,
      (
        coalesce(sum(case when p.method='airtel_money' then p.amount else 0 end),0) -
        coalesce((select sum(sr.amount) from public.sale_refunds sr,bounds b where sr.method='airtel_money' and sr.refunded_at>=b.start_at),0)
      )::numeric(14,2) as airtel_money_sales
    from public.payments p,bounds b
    where p.created_at>=b.start_at and p.status='completed'
  ),
  profit_summary as (
    select coalesce(sum(gross_profit_amount),0)::numeric(14,2) as gross_profit
    from public.sale_profit_lines spl,bounds b
    where spl.created_at>=b.start_at
  ),
  expense_summary as (
    select coalesce(sum(amount),0)::numeric(14,2) as expenses
    from public.expenses e,bounds b
    where e.created_at>=b.start_at and e.voided_at is null
  )
  select
    b.start_at,
    ss.sales,
    ps.cash_sales,
    ps.mtn_momo_sales,
    ps.airtel_money_sales,
    prs.gross_profit,
    es.expenses,
    (prs.gross_profit-es.expenses)::numeric(14,2),
    ss.transaction_count,
    case when ss.transaction_count>0
      then round(ss.sales/ss.transaction_count,2)
      else 0 end::numeric(14,2)
  from bounds b
  cross join sales_summary ss
  cross join payment_summary ps
  cross join profit_summary prs
  cross join expense_summary es;
end;
$function$;