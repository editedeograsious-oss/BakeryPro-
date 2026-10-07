-- Run only against staging. All fixtures and guard simulations are rolled back.
begin;
do $fixture$
declare v_owner uuid; v_customer uuid; v_material uuid; v_product uuid; v_tag text:=gen_random_uuid()::text;
begin
  if not exists(select 1 from public.system_environment_config where environment_mode='staging') then
    raise exception 'This test is restricted to staging';
  end if;
  select id into v_owner from public.profiles where role='owner' and active and disabled_at is null limit 1;
  if v_owner is null then raise exception 'Staging Owner required'; end if;
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  perform set_config('test.opening_owner',v_owner::text,true);
  v_customer:=public.save_customer(null,'ROLLBACK Opening Customer '||v_tag,null,null,null,null,null,false,gen_random_uuid());
  v_material:=public.save_raw_material(null,null,'ROLLBACK Opening Material '||v_tag,null,'kg','1 kg',1,0);
  select id into v_product from public.products where status='active' limit 1;
  if v_product is null then raise exception 'Staging product required'; end if;
  perform set_config('test.opening_customer',v_customer::text,true);
  perform set_config('test.opening_material',v_material::text,true);
  perform set_config('test.opening_product',v_product::text,true);
  -- An isolated charge tests real credit allocation and display, without creating a sale.
  insert into public.customer_credit_ledger(customer_id,entry_type,amount_delta,created_by,due_date)
  values(v_customer,'charge',100000,v_owner,public.business_current_date()-7);
end $fixture$;
set local role authenticated;
do $test$
declare
  v_c uuid:=current_setting('test.opening_customer')::uuid;
  v_m uuid:=current_setting('test.opening_material')::uuid;
  v_p uuid:=current_setting('test.opening_product')::uuid;
  v_req uuid:=gen_random_uuid(); v_stock uuid; v_fg uuid; v_credit uuid;
  v_baseline jsonb; v_after jsonb; v_denied boolean; v_paid uuid; v_voided uuid;
begin
  if not (public.opening_draft_setup_status()->>'editable')::boolean then raise exception 'Opening drafts should be editable before setup completion'; end if;
  select jsonb_build_object(
    'sales_total',(select coalesce(sum(total),0) from public.sales),
    'refund_total',(select coalesce(sum(refund_total),0) from public.sales),
    'stock_qty',(select coalesce(sum(current_stock_qty),0) from public.raw_materials),
    'stock_value',(select coalesce(sum(current_stock_qty*current_purchase_cost/purchase_pack_base_qty),0) from public.raw_materials),
    'finished_qty',(select coalesce(sum(quantity_available),0) from public.finished_goods_batches),
    'credit_due',(select coalesce(sum(balance_due),0) from public.customer_credit_summary),
    'cash_rows',(select count(*) from public.cash_movements),
    'credit_rows',(select count(*) from public.customer_credit_ledger),
    'purchase_rows',(select count(*) from public.purchases),
    'supplier_payment_rows',(select count(*) from public.purchase_payments)
  ) into v_baseline;

  v_stock:=public.save_opening_balance_draft(null,'raw_material',v_m,public.business_current_date(),25.5,4000,null,null,'Count sheet','Physical count',v_req,null);
  if public.save_opening_balance_draft(null,'raw_material',v_m,public.business_current_date(),25.5,4000,null,null,'Count sheet','Physical count',v_req,null)<>v_stock then
    raise exception 'An identical retry must return the same draft';
  end if;
  v_denied:=false;
  begin perform public.save_opening_balance_draft(null,'raw_material',v_m,public.business_current_date(),30,4000,null,null,'Count sheet','Physical count',v_req,null);
  exception when raise_exception then v_denied:=sqlerrm like 'Request ID was already used%'; end;
  if not v_denied then raise exception 'Reusing a request ID for changed data must fail'; end if;
  v_denied:=false;
  begin perform public.save_opening_balance_draft(null,'raw_material',v_m,public.business_current_date(),30,4000,null,null,null,null,gen_random_uuid(),null);
  exception when raise_exception then v_denied:=sqlerrm like 'This item or customer already has%'; end;
  if not v_denied then raise exception 'A second opening draft must be rejected'; end if;

  perform public.save_opening_balance_draft(v_stock,'raw_material',v_m,public.business_current_date(),30,4000,null,null,'Count sheet','Count corrected',gen_random_uuid(),1);
  if not exists(select 1 from public.opening_balance_drafts where id=v_stock and quantity=30 and version=2) then raise exception 'Draft edit failed'; end if;
  v_denied:=false;
  begin perform public.save_opening_balance_draft(v_stock,'raw_material',v_m,public.business_current_date(),35,4000,null,null,null,null,gen_random_uuid(),1);
  exception when raise_exception then v_denied:=sqlerrm like 'This draft changed%'; end;
  if not v_denied then raise exception 'A stale edit must not overwrite another edit'; end if;

  perform public.set_opening_draft_voided(v_stock,true,'Exclude mistaken count',2);
  if not exists(select 1 from public.opening_balance_drafts where id=v_stock and voided_at is not null and version=3) then raise exception 'Draft void failed'; end if;
  perform public.set_opening_draft_voided(v_stock,false,'Verified correct count',3);
  if not exists(select 1 from public.opening_balance_drafts where id=v_stock and voided_at is null and quantity=30 and version=4) then raise exception 'Draft restore failed'; end if;

  v_fg:=public.save_opening_balance_draft(null,'finished_goods',v_p,public.business_current_date(),7,2500,null,null,'Existing batch',null,gen_random_uuid(),null);
  v_credit:=public.save_opening_balance_draft(null,'customer_credit',v_c,public.business_current_date(),null,null,60000,public.business_current_date()-2,'Old notebook',null,gen_random_uuid(),null);
  if (select sum(quantity*unit_cost) from public.opening_balance_drafts where id=v_stock and voided_at is null)<>120000 then raise exception 'Draft stock value incorrect'; end if;
  if (select balance_due from public.opening_balance_drafts where id=v_credit)<>60000 then raise exception 'Draft debt amount incorrect'; end if;
  if coalesce((public.go_live_setup_readiness()->>'automatic_gate'),'pass')<>'fail'
      or (public.go_live_setup_readiness()->'automatic'->>'unposted_opening_drafts')::integer<3 then
    raise exception 'Unposted drafts must block go-live completion';
  end if;

  v_denied:=false;
  begin perform public.save_opening_balance_draft(null,'customer_credit',v_c,public.business_current_date(),null,null,'NaN'::numeric,null,null,null,gen_random_uuid(),null);
  exception when raise_exception then v_denied:=sqlerrm like 'Enter the positive amount%'; end;
  if not v_denied then raise exception 'Non-finite debt must be rejected'; end if;
  v_denied:=false;
  begin perform public.save_opening_balance_draft(null,'finished_goods',v_p,public.business_current_date(),1.5,2500,null,null,null,null,gen_random_uuid(),null);
  exception when raise_exception then v_denied:=sqlerrm like 'Finished goods quantities must be whole%'; end;
  if not v_denied then raise exception 'Fractional finished goods must be rejected'; end if;
  v_denied:=false;
  begin update public.opening_balance_drafts set balance_due=1 where id=v_credit;
  exception when insufficient_privilege then v_denied:=true; end;
  if not v_denied then raise exception 'Direct table writes must be denied'; end if;

  select jsonb_build_object(
    'sales_total',(select coalesce(sum(total),0) from public.sales),
    'refund_total',(select coalesce(sum(refund_total),0) from public.sales),
    'stock_qty',(select coalesce(sum(current_stock_qty),0) from public.raw_materials),
    'stock_value',(select coalesce(sum(current_stock_qty*current_purchase_cost/purchase_pack_base_qty),0) from public.raw_materials),
    'finished_qty',(select coalesce(sum(quantity_available),0) from public.finished_goods_batches),
    'credit_due',(select coalesce(sum(balance_due),0) from public.customer_credit_summary),
    'cash_rows',(select count(*) from public.cash_movements),
    'credit_rows',(select count(*) from public.customer_credit_ledger),
    'purchase_rows',(select count(*) from public.purchases),
    'supplier_payment_rows',(select count(*) from public.purchase_payments)
  ) into v_after;
  if v_baseline is distinct from v_after then raise exception 'Draft creation or correction changed live financial or stock totals'; end if;

  if (select outstanding_balance from public.customer_summary where customer_id=v_c)<>0
      or (select credit_balance_due from public.customer_summary where customer_id=v_c)<>100000
      or (select total_outstanding_balance from public.customer_summary where customer_id=v_c)<>100000 then
    raise exception 'Customers page must show credit debt separately from zero order debt';
  end if;
  v_paid:=public.record_credit_payment(v_c,40000,'cash',null,'Rollback allocation test',gen_random_uuid());
  if (select total_outstanding_balance from public.customer_summary where customer_id=v_c)<>60000 then raise exception 'Payment must reduce Customers balance'; end if;
  perform public.reverse_credit_payment(v_paid,'Rollback void test');
  if (select credit_balance_due from public.customer_summary where customer_id=v_c)<>100000 then raise exception 'Payment void must restore the debt'; end if;
  perform public.restore_credit_payment(v_paid,'Rollback restore test');
  if (select total_outstanding_balance from public.customer_summary where customer_id=v_c)<>60000 then raise exception 'Payment restore must reduce the debt again'; end if;
  v_voided:=public.record_credit_payment(v_c,10000,'cash',null,'Rollback lock test',gen_random_uuid());
  perform public.reverse_credit_payment(v_voided,'Prepare restore lock test');
  perform set_config('test.opening_paid',v_paid::text,true);
  perform set_config('test.opening_voided',v_voided::text,true);
  perform set_config('test.opening_stock_draft',v_stock::text,true);
end $test$;

reset role;
do $identity$
declare v_cashier uuid; v_manager uuid;
begin
  select id into v_cashier from public.profiles where role='cashier' and active and disabled_at is null limit 1;
  select id into v_manager from public.profiles where role='manager' and active and disabled_at is null limit 1;
  if v_cashier is null or v_manager is null then raise exception 'Staging Cashier and Manager required'; end if;
  perform set_config('test.opening_cashier',v_cashier::text,true);
  perform set_config('test.opening_manager',v_manager::text,true);
end $identity$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.opening_manager'),true);
do $manager$
begin
  perform public.set_opening_draft_voided(current_setting('test.opening_stock_draft')::uuid,true,'Manager correction',4);
  perform public.set_opening_draft_voided(current_setting('test.opening_stock_draft')::uuid,false,'Manager restore',5);
end $manager$;
select set_config('request.jwt.claim.sub',current_setting('test.opening_owner'),true);
select public.set_staff_permission_override(current_setting('test.opening_manager')::uuid,'credit:read',false,'Rollback opening permission test');
select set_config('request.jwt.claim.sub',current_setting('test.opening_manager'),true);
do $credit_override$
declare v_denied boolean:=false;
begin
  if exists(select 1 from public.opening_balance_drafts where kind='customer_credit') then
    raise exception 'A denied credit-read override must hide opening debts';
  end if;
  if (public.opening_draft_setup_status()->>'can_prepare_credit')::boolean then raise exception 'Denied credit-read override must disable preparation'; end if;
  begin perform public.save_opening_balance_draft(null,'customer_credit',current_setting('test.opening_customer')::uuid,public.business_current_date(),null,null,10,null,null,null,gen_random_uuid(),null);
  exception when raise_exception then v_denied:=sqlerrm like 'Not authorized to prepare customer credit%'; end;
  if not v_denied then raise exception 'Denied credit read must also reject draft writes'; end if;
end $credit_override$;
select set_config('request.jwt.claim.sub',current_setting('test.opening_owner'),true);
select public.set_staff_permission_override(current_setting('test.opening_manager')::uuid,'inventory:write',false,'Rollback opening permission test');
select set_config('request.jwt.claim.sub',current_setting('test.opening_manager'),true);
do $stock_override$
declare v_denied boolean:=false;
begin
  if not exists(select 1 from public.opening_balance_drafts where kind='raw_material') then raise exception 'A write restriction must preserve authorized stock viewing'; end if;
  if (public.opening_draft_setup_status()->>'can_prepare_stock')::boolean then raise exception 'Denied inventory write must disable preparation'; end if;
  begin perform public.save_opening_balance_draft(null,'raw_material',current_setting('test.opening_material')::uuid,public.business_current_date(),10,4000,null,null,null,null,gen_random_uuid(),null);
  exception when raise_exception then v_denied:=sqlerrm like 'Not authorized to prepare opening stock%'; end;
  if not v_denied then raise exception 'Denied stock write must reject opening draft writes'; end if;
end $stock_override$;
select set_config('request.jwt.claim.sub',current_setting('test.opening_cashier'),true);
do $cashier$
declare v_denied boolean:=false;
begin
  if exists(select 1 from public.opening_balance_drafts) then raise exception 'Cashier must not read opening drafts'; end if;
  begin perform public.save_opening_balance_draft(null,'customer_credit',current_setting('test.opening_customer')::uuid,public.business_current_date(),null,null,10,null,null,null,gen_random_uuid(),null);
  exception when raise_exception then v_denied:=sqlerrm like 'Only an active Owner or Manager%'; end;
  if not v_denied then raise exception 'Cashier must not create opening drafts'; end if;
end $cashier$;
select set_config('request.jwt.claim.sub','',true);
do $no_identity$
declare v_denied boolean:=false;
begin
  begin perform public.opening_draft_setup_status();
  exception when raise_exception then v_denied:=sqlerrm like 'Only an active Owner or Manager%'; end;
  if not v_denied then raise exception 'An authenticated role without an active staff identity must be denied'; end if;
end $no_identity$;
reset role;
set local role anon;
do $anonymous$
declare v_denied boolean:=false;
begin
  begin perform public.opening_draft_setup_status();
  exception when insufficient_privilege then v_denied:=true; end;
  if not v_denied then raise exception 'Anonymous RPC execution must be denied'; end if;
end $anonymous$;
reset role;

-- Simulate locked production in staging only. Operations are never enabled.
update public.system_environment_config set environment_mode='production',production_lock=true where id=1;
select set_config('request.jwt.claim.sub',current_setting('test.opening_owner'),true);
set local role authenticated;
do $prelaunch$
begin
  perform public.save_opening_balance_draft(current_setting('test.opening_stock_draft')::uuid,'raw_material',
    current_setting('test.opening_material')::uuid,public.business_current_date(),33,4000,null,null,
    'Prelaunch count','Preparation while locked',gen_random_uuid(),6);
  if (select current_stock_qty from public.raw_materials where id=current_setting('test.opening_material')::uuid)<>0 then
    raise exception 'Prelaunch draft must not change live stock';
  end if;
end $prelaunch$;
reset role;
update public.go_live_setup_state set completed_at=now() where id=1;
update public.production_cutover_state set operations_enabled=false where id=1;
select set_config('request.jwt.claim.sub',current_setting('test.opening_owner'),true);
set local role authenticated;
do $locked$
declare v_denied boolean;
begin
  v_denied:=false;
  begin perform public.record_credit_payment(current_setting('test.opening_customer')::uuid,1000,'cash',null,'Must be blocked',gen_random_uuid());
  exception when raise_exception then v_denied:=sqlerrm like 'Live business operations are currently disabled%'; end;
  if not v_denied then raise exception 'Locked production must block repayment'; end if;
  v_denied:=false;
  begin perform public.reverse_credit_payment(current_setting('test.opening_paid')::uuid,'Must be blocked');
  exception when raise_exception then v_denied:=sqlerrm like 'Live business operations are currently disabled%'; end;
  if not v_denied then raise exception 'Locked production must block repayment void'; end if;
  v_denied:=false;
  begin perform public.restore_credit_payment(current_setting('test.opening_voided')::uuid,'Must be blocked');
  exception when raise_exception then v_denied:=sqlerrm like 'Live business operations are currently disabled%'; end;
  if not v_denied then raise exception 'Locked production must block repayment restore'; end if;
  v_denied:=false;
  begin perform public.set_opening_draft_voided(current_setting('test.opening_stock_draft')::uuid,true,'Must be closed',7);
  exception when raise_exception then v_denied:=sqlerrm like 'Opening drafts are closed%'; end;
  if not v_denied then raise exception 'Completed setup must freeze opening drafts'; end if;
end $locked$;
select jsonb_build_object('result','PASS','verified',array[
  'drafts leave live stock and finance unchanged','duplicate and changed-request rejection',
  'edit with version check','void and restore','unposted drafts block completion',
  'Owner and Manager access','individual permission overrides','Cashier and anonymous denial','direct writes denied',
  'Customers and Credit Book balances agree through repayment void and restore',
  'locked prelaunch production accepts only opening drafts','locked production rejects credit transactions','completed setup freezes drafts'
]) as result;
rollback;
