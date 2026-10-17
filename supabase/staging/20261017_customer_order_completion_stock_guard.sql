-- STAGING ONLY: Stock-backed pickup order completion. Promote only after review and signed-in tests.
CREATE OR REPLACE FUNCTION public.update_customer_order_status(p_order_id uuid, p_status customer_order_status, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_before public.customer_orders%rowtype;
  v_role public.staff_role;
  v_paid numeric(14,2);
  v_valid boolean:=false;
  v_cake_status public.custom_cake_design_status;
  v_item record;
begin
  v_role:=public.current_staff_role();
  if v_role not in ('owner','manager','cashier','baker') then raise exception 'Not authorized'; end if;

  select * into v_before from public.customer_orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_before.status in ('completed','cancelled') then raise exception 'Order is already closed'; end if;
  if p_status=v_before.status then return; end if;

  if p_status='cancelled' then
    if v_role not in ('owner','manager','cashier') then raise exception 'Baker cannot cancel customer orders'; end if;
    if coalesce(trim(p_reason),'')='' then raise exception 'Cancellation reason is required'; end if;
    v_paid:=public.customer_order_net_paid(p_order_id);
    if v_paid>0 then raise exception 'Refund all recorded customer payments before cancellation'; end if;
    v_valid:=true;
  elsif v_role='baker' then
    v_valid:=(v_before.status='confirmed' and p_status='in_production')
      or (v_before.status='in_production' and p_status='ready');
  elsif v_role='cashier' then
    v_valid:=(v_before.status='pending' and p_status='confirmed')
      or (v_before.status='ready' and p_status='completed' and v_before.fulfillment='pickup');
  else
    v_valid:=(v_before.status='pending' and p_status='confirmed')
      or (v_before.status='confirmed' and p_status='in_production')
      or (v_before.status='in_production' and p_status='ready')
      or (v_before.status='ready' and p_status='completed' and v_before.fulfillment='pickup');
  end if;

  if not v_valid then raise exception 'Invalid order status transition'; end if;

  if p_status='in_production' and exists(select 1 from public.custom_cake_specs where order_id=p_order_id) then
    select design_status into v_cake_status from public.custom_cake_specs where order_id=p_order_id;
    if v_cake_status<>'approved' then raise exception 'Custom cake must be approved before production'; end if;
  end if;
  if p_status='completed' and v_before.fulfillment='delivery' then
    raise exception 'Delivery orders are completed through the delivery workflow';
  end if;

  -- Atomic batch deduction is mandatory for completed pickup orders.
  if p_status='completed' then
    for v_item in select id from public.customer_order_items
      where order_id=p_order_id and product_id is not null order by id
    loop
      perform public.allocate_customer_order_item_to_batches(v_item.id,true);
    end loop;
  end if;

  update public.customer_orders
  set status=p_status,
      completed_at=case when p_status='completed' then now() else completed_at end,
      cancelled_at=case when p_status='cancelled' then now() else cancelled_at end,
      cancellation_reason=case when p_status='cancelled' then trim(p_reason) else cancellation_reason end,
      updated_at=now()
  where id=p_order_id;

  if exists(select 1 from public.custom_cake_specs where order_id=p_order_id) then
    update public.custom_cake_specs
    set design_status=case
      when p_status='in_production' then 'in_production'::public.custom_cake_design_status
      when p_status='ready' then 'ready'::public.custom_cake_design_status
      when p_status='completed' then 'completed'::public.custom_cake_design_status
      when p_status='cancelled' then 'cancelled'::public.custom_cake_design_status
      else design_status end,
      updated_at=now()
    where order_id=p_order_id;
  end if;

  perform public.sync_order_loyalty_points(p_order_id);

  insert into public.audit_logs(actor_id,action,entity,entity_id,before_data,after_data)
  values(auth.uid(),'update_customer_order_status','customer_order',p_order_id,
    jsonb_build_object('status',v_before.status),
    jsonb_build_object('status',p_status,'reason',p_reason));
end;
$function$;

-- Retire legacy 2-argument function that bypassed transition validation.
DROP FUNCTION IF EXISTS public.update_customer_order_status(uuid,public.customer_order_status);
