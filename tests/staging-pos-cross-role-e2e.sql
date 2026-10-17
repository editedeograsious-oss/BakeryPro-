BEGIN;
DO $g$ BEGIN IF (SELECT environment_mode FROM public.system_environment_config WHERE id=1)<>'staging' THEN RAISE EXCEPTION 'Staging rollback only'; END IF; END $g$;
SELECT set_config('qa.owner',(SELECT id::text FROM public.profiles WHERE role='owner' AND active AND disabled_at IS NULL LIMIT 1),true);
SELECT set_config('qa.cashier',(SELECT id::text FROM public.profiles WHERE role='cashier' AND active AND disabled_at IS NULL LIMIT 1),true);
SELECT set_config('qa.manager',(SELECT id::text FROM public.profiles WHERE role='manager' AND active AND disabled_at IS NULL LIMIT 1),true);
SELECT set_config('request.jwt.claim.sub',current_setting('qa.owner'),true);
SET LOCAL ROLE authenticated;
SELECT set_config('qa.product',public.save_product(NULL::uuid,'ROLLBACK POS QA Bread',NULL::uuid,5000,'Only staging integration test')::text,true);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.cashier'),true);
SET LOCAL ROLE authenticated;
DO $test$ DECLARE failed boolean:=false; BEGIN
 BEGIN PERFORM public.complete_sale_v038(jsonb_build_array(jsonb_build_object('product_id',current_setting('qa.product'),'quantity',2)),0,NULL,'[{"method":"cash","amount":10000}]'::jsonb,NULL,false,gen_random_uuid(),NULL,NULL);
 EXCEPTION WHEN raise_exception THEN failed:=position('shift' in lower(SQLERRM))>0; END;
 IF NOT failed THEN RAISE EXCEPTION 'Unexpected sale without shift'; END IF;
END $test$;
SELECT set_config('qa.shift',public.start_cashier_shift(20000)::text,true);
DO $test$ DECLARE failed boolean:=false; BEGIN
 BEGIN PERFORM public.complete_sale_v038(jsonb_build_array(jsonb_build_object('product_id',current_setting('qa.product'),'quantity',2)),0,NULL,'[{"method":"cash","amount":10000}]'::jsonb,NULL,false,gen_random_uuid(),NULL,NULL);
 EXCEPTION WHEN raise_exception THEN failed:=position('stock' in lower(SQLERRM))>0; END;
 IF NOT failed THEN RAISE EXCEPTION 'Unexpected sale without finished goods stock'; END IF;
END $test$;
RESET ROLE;
WITH p AS (INSERT INTO public.production_plan_items(business_date,product_id,planned_qty,produced_qty,status,created_by)
 VALUES(CURRENT_DATE,current_setting('qa.product')::uuid,6,6,'complete',current_setting('qa.owner')::uuid) RETURNING id)
 SELECT set_config('qa.plan',(SELECT id::text FROM p),true);
WITH r AS (INSERT INTO public.production_runs(plan_item_id,quantity_produced,confirmed_by)
 VALUES(current_setting('qa.plan')::uuid,6,current_setting('qa.owner')::uuid) RETURNING id)
 SELECT set_config('qa.run',(SELECT id::text FROM r),true);
WITH b AS (INSERT INTO public.finished_goods_batches(batch_no,production_run_id,product_id,production_date,quantity_produced,quantity_available,batch_cost,unit_cost)
 VALUES('ROLLBACK-QA-'||gen_random_uuid(),current_setting('qa.run')::uuid,current_setting('qa.product')::uuid,CURRENT_DATE,6,6,12000,2000) RETURNING id)
 SELECT set_config('qa.batch',(SELECT id::text FROM b),true);
SELECT set_config('request.jwt.claim.sub',current_setting('qa.cashier'),true);
SET LOCAL ROLE authenticated;
SELECT set_config('qa.idempotency',gen_random_uuid()::text,true);
SELECT set_config('qa.sale',public.complete_sale_v038(jsonb_build_array(jsonb_build_object('product_id',current_setting('qa.product'),'quantity',2)),0,NULL,'[{"method":"cash","amount":10000}]'::jsonb,'Temporary staging test',false,current_setting('qa.idempotency')::uuid,NULL,NULL)::text,true);
DO $test$ DECLARE repeat_sale uuid; BEGIN
 SELECT public.complete_sale_v038(jsonb_build_array(jsonb_build_object('product_id',current_setting('qa.product'),'quantity',2)),0,NULL,'[{"method":"cash","amount":10000}]'::jsonb,'Temporary staging test',false,current_setting('qa.idempotency')::uuid,NULL,NULL) INTO repeat_sale;
 IF repeat_sale::text<>current_setting('qa.sale') THEN RAISE EXCEPTION 'Duplicate sale created'; END IF;
 IF (SELECT quantity_available FROM public.finished_goods_batches WHERE id=current_setting('qa.batch')::uuid)<>4 THEN RAISE EXCEPTION 'Stock was not deducted once'; END IF;
 IF (SELECT count(*) FROM public.sales WHERE id=current_setting('qa.sale')::uuid AND total=10000 AND status='completed')<>1 THEN RAISE EXCEPTION 'Sale missing'; END IF;
 IF (SELECT coalesce(sum(amount),0) FROM public.payments WHERE sale_id=current_setting('qa.sale')::uuid)<>10000 THEN RAISE EXCEPTION 'Payment ledger mismatch'; END IF;
END $test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.manager'),true);
SET LOCAL ROLE authenticated;
DO $t$ BEGIN IF (SELECT count(*) FROM public.sales WHERE id=current_setting('qa.sale')::uuid)<>1 THEN RAISE EXCEPTION 'Manager cannot read transaction'; END IF; END $t$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.owner'),true);
SET LOCAL ROLE authenticated;
DO $t$ BEGIN IF (SELECT count(*) FROM public.sales WHERE id=current_setting('qa.sale')::uuid)<>1 THEN RAISE EXCEPTION 'Owner cannot read transaction'; END IF; END $t$;
RESET ROLE;
SELECT jsonb_build_object('result','PASS','no_shift_blocked',true,'no_stock_blocked',true,'transaction_shared_with_owner_manager_cashier',true,'payment_total',10000,'stock_remaining',4,'idempotent',true,'rollback',true) as qa_result;
ROLLBACK;