BEGIN;
DO $gate$ BEGIN IF (SELECT environment_mode FROM public.system_environment_config WHERE id=1)<>'staging'
 THEN RAISE EXCEPTION 'Staging only';END IF;END $gate$;
SELECT set_config('test.finished.owner',(SELECT id::text FROM public.profiles WHERE role='owner' AND active AND disabled_at IS NULL LIMIT 1),true);
SELECT set_config('test.finished.product',(SELECT id::text FROM public.products WHERE status='active' ORDER BY created_at LIMIT 1),true);
SELECT set_config('request.jwt.claim.sub',current_setting('test.finished.owner'),true);
SET LOCAL ROLE authenticated;
SELECT set_config('test.finished.batch',public.owner_add_finished_stock(
 current_setting('test.finished.product')::uuid,12,2500,
 (now() AT TIME ZONE 'Africa/Kampala')::date,
 'Actual physically counted opening bakery stock',gen_random_uuid()
)::text,true);
RESET ROLE;
DO $shift$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.cashier_shifts
 WHERE cashier_id=current_setting('test.finished.owner')::uuid AND status='open')
 THEN
  INSERT INTO public.cashier_shifts(cashier_id,opened_by,opening_float,status)
  VALUES (current_setting('test.finished.owner')::uuid,current_setting('test.finished.owner')::uuid,0,'open');
 END IF;
END $shift$;
SET LOCAL ROLE authenticated;
SELECT set_config('test.finished.sale',public.complete_sale_v038(
 jsonb_build_array(jsonb_build_object('product_id',current_setting('test.finished.product'),'quantity',2)),0,null,
 jsonb_build_array(jsonb_build_object('method','cash','amount',10000)),null,false,gen_random_uuid(),null,null
)::text,true);
DO $check$ BEGIN
 IF (SELECT quantity_available FROM public.finished_goods_batches
 WHERE id=current_setting('test.finished.batch')::uuid)<>10
 THEN RAISE EXCEPTION 'POS did not deduct two units of manually recorded stock';END IF;
 IF (SELECT count(*) FROM public.sale_batch_allocations
 WHERE batch_id=current_setting('test.finished.batch')::uuid AND quantity=2)<>1
 THEN RAISE EXCEPTION 'POS batch allocation missing';END IF;
 IF (SELECT total FROM public.sales WHERE id=current_setting('test.finished.sale')::uuid)<>10000
 THEN RAISE EXCEPTION 'POS sale total incorrect';END IF;
END $check$;
RESET ROLE;
SELECT jsonb_build_object('result','PASS','manual_stock_start',12,'after_sale',10,
 'sold',2,'sale_ugx',10000,'no_fake_production',true,'rollback',true) AS audit;
ROLLBACK;