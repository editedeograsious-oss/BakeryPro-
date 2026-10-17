BEGIN;
DO $guard$ BEGIN
 IF (SELECT environment_mode FROM public.system_environment_config WHERE id=1)<>'staging' THEN RAISE EXCEPTION 'Staging only'; END IF;
END $guard$;
SELECT set_config('test.pos.owner',(SELECT id::text FROM public.profiles WHERE role='owner' AND active AND disabled_at IS NULL LIMIT 1),true);
SELECT set_config('request.jwt.claim.sub',current_setting('test.pos.owner'),true);
SET LOCAL ROLE authenticated;
SELECT set_config('test.pos.product',public.save_product(NULL::uuid,'ROLLBACK POS E2E Bread',NULL::uuid,7500,'Temporary POS integration fixture')::text,true);
RESET ROLE;
WITH x AS(
 INSERT INTO public.cashier_shifts(cashier_id,opened_by,opening_float,status)
 VALUES(current_setting('test.pos.owner')::uuid,current_setting('test.pos.owner')::uuid,0,'open') RETURNING id
) SELECT set_config('test.pos.shift',(SELECT id::text FROM x),true);
WITH x AS(
 INSERT INTO public.production_plan_items(business_date,product_id,planned_qty,produced_qty,status,created_by)
 VALUES(CURRENT_DATE,current_setting('test.pos.product')::uuid,4,4,'complete',current_setting('test.pos.owner')::uuid) RETURNING id
) SELECT set_config('test.pos.plan',(SELECT id::text FROM x),true);
WITH x AS(
 INSERT INTO public.production_runs(plan_item_id,quantity_produced,confirmed_by)
 VALUES(current_setting('test.pos.plan')::uuid,4,current_setting('test.pos.owner')::uuid) RETURNING id
) SELECT set_config('test.pos.run',(SELECT id::text FROM x),true);
WITH x AS(
 INSERT INTO public.finished_goods_batches(batch_no,production_run_id,product_id,production_date,quantity_produced,quantity_available,batch_cost,unit_cost)
 VALUES('ROLLBACK-POS-'||substr(gen_random_uuid()::text,1,12),current_setting('test.pos.run')::uuid,current_setting('test.pos.product')::uuid,CURRENT_DATE,4,4,12000,3000) RETURNING id
) SELECT set_config('test.pos.batch',(SELECT id::text FROM x),true);
SELECT set_config('test.pos.request',gen_random_uuid()::text,true);
SET LOCAL ROLE authenticated;
SELECT set_config('test.pos.sale',public.complete_sale_v038(
 jsonb_build_array(jsonb_build_object('product_id',current_setting('test.pos.product'),'quantity',2)),0,null,
 jsonb_build_array(jsonb_build_object('method','cash','amount',15000)),null,false,
 current_setting('test.pos.request')::uuid,null,null
)::text,true);
DO $verify$ BEGIN
 IF (SELECT total FROM public.sales WHERE id=current_setting('test.pos.sale')::uuid)<>15000 THEN
 RAISE EXCEPTION 'Saved sale total mismatch'; END IF;
 IF (SELECT count(*) FROM public.payments WHERE sale_id=current_setting('test.pos.sale')::uuid AND amount=15000)<>1 THEN
 RAISE EXCEPTION 'POS payment missing'; END IF;
 IF (SELECT quantity_available FROM public.finished_goods_batches WHERE id=current_setting('test.pos.batch')::uuid)<>2 THEN
 RAISE EXCEPTION 'POS stock not deducted'; END IF;
 IF (SELECT count(*) FROM public.sale_items WHERE sale_id=current_setting('test.pos.sale')::uuid)<>1 THEN
 RAISE EXCEPTION 'Sale items missing'; END IF;
END $verify$;
DO $replay$ DECLARE second_sale uuid;BEGIN
 SELECT public.complete_sale_v038(
 jsonb_build_array(jsonb_build_object('product_id',current_setting('test.pos.product'),'quantity',2)),0,null,
 jsonb_build_array(jsonb_build_object('method','cash','amount',15000)),null,false,
 current_setting('test.pos.request')::uuid,null,null
 ) INTO second_sale;
 IF second_sale <> current_setting('test.pos.sale')::uuid THEN RAISE EXCEPTION 'Duplicate sale generated on retry'; END IF;
 IF (SELECT quantity_available FROM public.finished_goods_batches WHERE id=current_setting('test.pos.batch')::uuid) <> 2
 THEN RAISE EXCEPTION 'Duplicate stock deduction'; END IF;
END $replay$;
SELECT jsonb_build_object('result','PASS','sale_in_db',true,'payment_total',15000,'deducted_units',2,'retry_idempotent',true,'rolled_back',true) result;
ROLLBACK;