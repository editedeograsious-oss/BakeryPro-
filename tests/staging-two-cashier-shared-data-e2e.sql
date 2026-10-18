-- Two distinct cashier identities, one CEO and one manager; staging only.
-- All inserted products, shifts, production, sales, payments and alerts ROLLBACK.
BEGIN;
DO $g$ BEGIN
 IF (SELECT environment_mode FROM public.system_environment_config WHERE id=1) IS DISTINCT FROM 'staging'
 THEN RAISE EXCEPTION 'Staging only'; END IF;
END $g$;
SELECT set_config('qa.owner',(SELECT id::text FROM public.profiles WHERE role='owner' AND active AND disabled_at IS NULL LIMIT 1),true);
SELECT set_config('qa.manager',(SELECT id::text FROM public.profiles WHERE role='manager' AND active AND disabled_at IS NULL LIMIT 1),true);
SELECT set_config('qa.cashier_a',(SELECT id::text FROM public.profiles WHERE role='cashier' AND active AND disabled_at IS NULL ORDER BY id OFFSET 0 LIMIT 1),true);
SELECT set_config('qa.cashier_b',(SELECT id::text FROM public.profiles WHERE role='cashier' AND active AND disabled_at IS NULL ORDER BY id OFFSET 1 LIMIT 1),true);
DO $g$ BEGIN
 IF current_setting('qa.cashier_a')=current_setting('qa.cashier_b')
 OR current_setting('qa.cashier_a')='' OR current_setting('qa.cashier_b')=''
 THEN RAISE EXCEPTION 'Two independent cashiers are required'; END IF;
END $g$;

SELECT set_config('request.jwt.claim.sub',current_setting('qa.owner'),true);
SET LOCAL ROLE authenticated;
SELECT set_config('qa.product',public.save_product(NULL::uuid,'ROLLBACK Two Cashiers Test Product',NULL::uuid,5000,'Temporary two-account staging QA')::text,true);
RESET ROLE;

WITH p AS (INSERT INTO public.production_plan_items(business_date,product_id,planned_qty,produced_qty,status,created_by)
 VALUES(CURRENT_DATE,current_setting('qa.product')::uuid,10,10,'complete',current_setting('qa.owner')::uuid) RETURNING id)
 SELECT set_config('qa.plan',(SELECT id::text FROM p),true);
WITH r AS (INSERT INTO public.production_runs(plan_item_id,quantity_produced,confirmed_by)
 VALUES(current_setting('qa.plan')::uuid,10,current_setting('qa.owner')::uuid) RETURNING id)
 SELECT set_config('qa.run',(SELECT id::text FROM r),true);
WITH b AS (INSERT INTO public.finished_goods_batches(batch_no,production_run_id,product_id,production_date,quantity_produced,quantity_available,batch_cost,unit_cost)
 VALUES('ROLLBACK-2C-'||gen_random_uuid(),current_setting('qa.run')::uuid,current_setting('qa.product')::uuid,CURRENT_DATE,10,10,20000,2000) RETURNING id)
 SELECT set_config('qa.batch',(SELECT id::text FROM b),true);

-- Cashier A creates independent shift and posts exactly one sale.
SELECT set_config('request.jwt.claim.sub',current_setting('qa.cashier_a'),true);
SET LOCAL ROLE authenticated;
SELECT set_config('qa.shift_a',COALESCE(
 (SELECT cs.id::text FROM public.cashier_shifts cs WHERE cs.cashier_id=auth.uid() AND cs.status='open' ORDER BY cs.opened_at DESC LIMIT 1),
 public.start_cashier_shift(20000)::text),true);
SELECT set_config('qa.sale_a',public.complete_sale_v038(jsonb_build_array(jsonb_build_object('product_id',current_setting('qa.product'),'quantity',1)),0,NULL,
  '[{"method":"cash","amount":5000}]'::jsonb,'STAGING QA - cashier A',false,gen_random_uuid(),NULL,NULL)::text,true);
RESET ROLE;

-- Cashier B is a different authenticated identity; separate shift and sale.
SELECT set_config('request.jwt.claim.sub',current_setting('qa.cashier_b'),true);
SET LOCAL ROLE authenticated;
SELECT set_config('qa.shift_b',COALESCE(
 (SELECT cs.id::text FROM public.cashier_shifts cs WHERE cs.cashier_id=auth.uid() AND cs.status='open' ORDER BY cs.opened_at DESC LIMIT 1),
 public.start_cashier_shift(15000)::text),true);
SELECT set_config('qa.sale_b',public.complete_sale_v038(jsonb_build_array(jsonb_build_object('product_id',current_setting('qa.product'),'quantity',1)),0,NULL,
  '[{"method":"cash","amount":5000}]'::jsonb,'STAGING QA - cashier B',false,gen_random_uuid(),NULL,NULL)::text,true);
RESET ROLE;

DO $qa$
DECLARE v_name_a text;v_name_b text;
BEGIN
 IF current_setting('qa.shift_a')=current_setting('qa.shift_b')
 OR current_setting('qa.sale_a')=current_setting('qa.sale_b')
 THEN RAISE EXCEPTION 'Cashier entries were not independent'; END IF;
 IF (SELECT count(*) FROM public.sales
  WHERE (id=current_setting('qa.sale_a')::uuid AND cashier_id=current_setting('qa.cashier_a')::uuid)
    OR (id=current_setting('qa.sale_b')::uuid AND cashier_id=current_setting('qa.cashier_b')::uuid))<>2
 THEN RAISE EXCEPTION 'Sales were attributed to wrong staff identities';END IF;
 IF (SELECT quantity_available FROM public.finished_goods_batches
     WHERE id=current_setting('qa.batch')::uuid)<>8
 THEN RAISE EXCEPTION 'Shared stock did not deduct one unit per cashier';END IF;
 IF (SELECT coalesce(sum(amount),0) FROM public.payments
  WHERE sale_id IN (current_setting('qa.sale_a')::uuid,current_setting('qa.sale_b')::uuid))<>10000
 THEN RAISE EXCEPTION 'Cashier payments did not reconcile';END IF;
 IF (SELECT count(*) FROM public.audit_logs
   WHERE action='complete_sale' AND entity='sale' AND
   ((entity_id=current_setting('qa.sale_a')::uuid AND actor_id=current_setting('qa.cashier_a')::uuid)
   OR (entity_id=current_setting('qa.sale_b')::uuid AND actor_id=current_setting('qa.cashier_b')::uuid)))<>2
 THEN RAISE EXCEPTION 'Distinct cashier audit identities missing';END IF;
 SELECT full_name INTO v_name_a FROM public.profiles WHERE id=current_setting('qa.cashier_a')::uuid;
 SELECT full_name INTO v_name_b FROM public.profiles WHERE id=current_setting('qa.cashier_b')::uuid;
 IF (SELECT count(*) FROM public.staff_notifications n
      JOIN public.audit_logs a ON a.id=n.source_audit_id
      WHERE a.action='complete_sale'
        AND a.entity_id IN (current_setting('qa.sale_a')::uuid,current_setting('qa.sale_b')::uuid)
        AND n.recipient_id IN (current_setting('qa.owner')::uuid,current_setting('qa.manager')::uuid))<>4
 THEN RAISE EXCEPTION 'CEO/manager did not receive two cashier alerts each';END IF;
 IF (SELECT count(*) FROM public.staff_notifications n
      JOIN public.audit_logs a ON a.id=n.source_audit_id
      WHERE a.action='complete_sale' AND
      ((a.entity_id=current_setting('qa.sale_a')::uuid AND n.actor_id=current_setting('qa.cashier_a')::uuid AND n.actor_name=v_name_a)
       OR
       (a.entity_id=current_setting('qa.sale_b')::uuid AND n.actor_id=current_setting('qa.cashier_b')::uuid AND n.actor_name=v_name_b)))<>4
 THEN RAISE EXCEPTION 'Notification actor names did not match cashier identities';END IF;
END $qa$;

-- Both financial supervisors must see the same two sales.
SELECT set_config('request.jwt.claim.sub',current_setting('qa.owner'),true);
SET LOCAL ROLE authenticated;
DO $test$ BEGIN
 IF (SELECT count(*) FROM public.sales WHERE id IN(current_setting('qa.sale_a')::uuid,current_setting('qa.sale_b')::uuid))<>2
 THEN RAISE EXCEPTION 'CEO cannot see both cashier transactions';END IF;
END $test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.manager'),true);
SET LOCAL ROLE authenticated;
DO $test$ BEGIN
 IF (SELECT count(*) FROM public.sales WHERE id IN(current_setting('qa.sale_a')::uuid,current_setting('qa.sale_b')::uuid))<>2
 THEN RAISE EXCEPTION 'Manager cannot see both cashier transactions';END IF;
END $test$;
RESET ROLE;
SELECT jsonb_build_object('result','PASS','distinct_cashiers',2,'sales_created',2,'total_payment',10000,
 'stock_before',10,'stock_after',8,'owner_manager_notices',4,'transactions_rolled_back',true) AS qa_result;
ROLLBACK;