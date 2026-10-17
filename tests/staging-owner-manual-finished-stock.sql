BEGIN;
DO $g$ BEGIN
 IF (SELECT environment_mode FROM public.system_environment_config WHERE id=1)<>'staging' THEN
 RAISE EXCEPTION 'Staging-only test'; END IF; END $g$;
SELECT set_config('test.manual.owner',(SELECT id::text FROM public.profiles WHERE role='owner' AND active AND disabled_at IS NULL LIMIT 1),true);
SELECT set_config('test.manual.product',(SELECT id::text FROM public.products WHERE status='active' LIMIT 1),true);
SELECT set_config('test.manual.req',gen_random_uuid()::text,true);
SELECT set_config('request.jwt.claim.sub',current_setting('test.manual.owner'),true);
SET LOCAL ROLE authenticated;
SELECT set_config('test.manual.batch',public.owner_add_finished_stock(
 current_setting('test.manual.product')::uuid,12,2400,
 (now() AT TIME ZONE 'Africa/Kampala')::date,
 'Opening stock of twelve physically counted breads',current_setting('test.manual.req')::uuid
)::text,true);
DO $t$ DECLARE second uuid;
BEGIN
 SELECT public.owner_add_finished_stock(current_setting('test.manual.product')::uuid,12,2400,
 (now() AT TIME ZONE 'Africa/Kampala')::date,'Opening stock of twelve physically counted breads',
 current_setting('test.manual.req')::uuid) INTO second;
 IF second<>current_setting('test.manual.batch')::uuid THEN RAISE EXCEPTION 'Duplicate manual stock'; END IF;
 IF (SELECT quantity_available FROM public.finished_goods_batches WHERE id=second)<>12 THEN
 RAISE EXCEPTION 'Manual stock count wrong'; END IF;
 IF (SELECT batch_cost FROM public.finished_goods_batches WHERE id=second)<>28800 THEN
 RAISE EXCEPTION 'Manual stock cost wrong'; END IF;
 IF (SELECT source_type FROM public.finished_goods_batches WHERE id=second)<>'manual'
 OR (SELECT production_run_id FROM public.finished_goods_batches WHERE id=second) IS NOT NULL THEN
 RAISE EXCEPTION 'Manual stock incorrectly linked to production'; END IF;
 IF (SELECT available_quantity FROM public.pos_available_finished_stock()
 WHERE product_id=current_setting('test.manual.product')::uuid)<>12 THEN
 RAISE EXCEPTION 'POS stock mismatch'; END IF;
 IF (SELECT count(*) FROM public.audit_logs WHERE entity_id=second AND action='manual_finished_stock_in')<>1 THEN
 RAISE EXCEPTION 'Audit log missing'; END IF;
END $t$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $t$ DECLARE blocked bool:=false;
BEGIN
 BEGIN PERFORM public.owner_add_finished_stock(current_setting('test.manual.product')::uuid,1,100,
 (now() AT TIME ZONE 'Africa/Kampala')::date,'Unapproved external stock import',gen_random_uuid());
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Anonymous access to stock entry'; END IF;
END $t$;
RESET ROLE;
SELECT jsonb_build_object('result','PASS','manual_intake',12,'POS_quantity',12,
 'cost_value',28800,'idempotent',true,'audit_logged',true,'guest_blocked',true,
 'fake_production_run',false,'rollback',true) AS audit;
ROLLBACK;