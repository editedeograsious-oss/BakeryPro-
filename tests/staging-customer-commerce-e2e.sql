-- DS Bakery staging-only complete customer-commerce database regression.
-- Simulated product image URL and production batch are fixtures, NOT real media uploads.
-- Entire transaction rolls back; no actual bakery order, product, stock or review persists.
BEGIN;
DO $guard$ BEGIN
 IF (SELECT environment_mode FROM public.system_environment_config WHERE id=1)<>'staging' THEN
 RAISE EXCEPTION 'STAGING only'; END IF;
END $guard$;
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM public.profiles WHERE role='owner' AND active AND disabled_at IS NULL LIMIT 1),true);
SET LOCAL ROLE authenticated;
SELECT set_config('test.flow.owner',(SELECT id::text FROM public.profiles WHERE role='owner' AND active AND disabled_at IS NULL LIMIT 1),true);
SELECT set_config('test.flow.product',public.save_product(null::uuid,'ROLLBACK E2E Bakery Bread',null::uuid,7500,'Temporary staging integration fixture')::text,true);
RESET ROLE;
UPDATE public.products SET image_url='https://example.test/fixture-only.jpg' WHERE id=current_setting('test.flow.product')::uuid;
SET LOCAL ROLE authenticated;
SELECT public.owner_set_product_online(current_setting('test.flow.product')::uuid,true);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE anon;
DO $check$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.public_product_catalog() WHERE id=current_setting('test.flow.product')::uuid) THEN
 RAISE EXCEPTION 'Guest catalogue missing published product'; END IF;
END $check$;
DO $must_sign_in$ DECLARE blocked boolean:=false; BEGIN
  BEGIN
    PERFORM public.submit_public_order('ROLLBACK E2E CUSTOMER','0711-STAGING-TEST',null,'pickup',
    now()+interval '2 days',null,'Automated integration fixture',
    jsonb_build_array(jsonb_build_object('product_id',current_setting('test.flow.product'),'quantity',2)),gen_random_uuid());
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Guest customer order bypassed verified-login requirement'; END IF;
END $must_sign_in$;
RESET ROLE;
SELECT set_config('test.flow.phone','07'||substr(md5(gen_random_uuid()::text),1,12),true);
SELECT set_config('request.jwt.claim.sub',current_setting('test.flow.owner'),true);
SET LOCAL ROLE authenticated;
SELECT set_config('test.flow.order',public.submit_public_order(
  'ROLLBACK E2E CUSTOMER',current_setting('test.flow.phone'),
  (SELECT email FROM auth.users WHERE id=current_setting('test.flow.owner')::uuid),
  'pickup',now()+interval '2 days',null,'Automated integration fixture',
  jsonb_build_array(jsonb_build_object('product_id',current_setting('test.flow.product'),'quantity',2)),gen_random_uuid()
)::text,true);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',current_setting('test.flow.owner'),true);
SET LOCAL ROLE authenticated;
DO $check$ BEGIN
 IF (SELECT total_amount FROM public.customer_orders WHERE id=(current_setting('test.flow.order')::jsonb->>'order_id')::uuid)<>15000 THEN
 RAISE EXCEPTION 'Checkout total mismatch'; END IF;
END $check$;
SELECT public.update_customer_order_status((current_setting('test.flow.order')::jsonb->>'order_id')::uuid,'confirmed'::public.customer_order_status,null::text);
SELECT public.update_customer_order_status((current_setting('test.flow.order')::jsonb->>'order_id')::uuid,'in_production'::public.customer_order_status,null::text);
SELECT public.update_customer_order_status((current_setting('test.flow.order')::jsonb->>'order_id')::uuid,'ready'::public.customer_order_status,null::text);
DO $check$ DECLARE blocked boolean:=false; BEGIN
 BEGIN PERFORM public.update_customer_order_status((current_setting('test.flow.order')::jsonb->>'order_id')::uuid,'completed'::public.customer_order_status,null::text);
 EXCEPTION WHEN raise_exception THEN blocked:=SQLERRM LIKE '%Insufficient finished-goods stock%'; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Critical: pickup completed with no finished-goods stock'; END IF;
 IF (SELECT status FROM public.customer_orders WHERE id=(current_setting('test.flow.order')::jsonb->>'order_id')::uuid)<>'ready' THEN
 RAISE EXCEPTION 'Order status changed despite insufficient stock'; END IF;
END $check$;
RESET ROLE;
WITH i AS (
 INSERT INTO public.production_plan_items (business_date,product_id,planned_qty,produced_qty,status,created_by)
 VALUES (CURRENT_DATE,current_setting('test.flow.product')::uuid,4,4,'complete',current_setting('test.flow.owner')::uuid)
 RETURNING id
) SELECT set_config('test.flow.plan_item',(SELECT id::text FROM i),true);
WITH r AS (
 INSERT INTO public.production_runs (plan_item_id,quantity_produced,confirmed_by)
 VALUES(current_setting('test.flow.plan_item')::uuid,4,current_setting('test.flow.owner')::uuid)
 RETURNING id
) SELECT set_config('test.flow.run',(SELECT id::text FROM r),true);
WITH b AS (
 INSERT INTO public.finished_goods_batches(batch_no,production_run_id,product_id,production_date,quantity_produced,quantity_available,batch_cost,unit_cost)
 VALUES('ROLLBACK-'||gen_random_uuid()::text,current_setting('test.flow.run')::uuid,current_setting('test.flow.product')::uuid,CURRENT_DATE,4,4,12000,3000)
 RETURNING id
) SELECT set_config('test.flow.batch',(SELECT id::text FROM b),true);
SET LOCAL ROLE authenticated;
SELECT public.update_customer_order_status((current_setting('test.flow.order')::jsonb->>'order_id')::uuid,'completed'::public.customer_order_status,null::text);
DO $check$ BEGIN
 IF (SELECT quantity_available FROM public.finished_goods_batches WHERE id=current_setting('test.flow.batch')::uuid)<>2 THEN RAISE EXCEPTION 'Batch quantity not deducted correctly'; END IF;
 IF (SELECT coalesce(sum(quantity),0) FROM public.customer_order_batch_allocations WHERE batch_id=current_setting('test.flow.batch')::uuid)<>2 THEN RAISE EXCEPTION 'Order did not allocate 2 units'; END IF;
 IF (SELECT status FROM public.customer_orders WHERE id=(current_setting('test.flow.order')::jsonb->>'order_id')::uuid)<>'completed' THEN RAISE EXCEPTION 'Order was not completed'; END IF;
END $check$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE anon;
SELECT set_config('test.flow.review',public.submit_verified_product_review(
current_setting('test.flow.order')::jsonb->>'order_no',current_setting('test.flow.phone'),current_setting('test.flow.product')::uuid,
5,'Staging Customer','Test item was fresh and carefully packed.')::text,true);
DO $check$ BEGIN
 IF EXISTS(SELECT 1 FROM public.approved_product_reviews(current_setting('test.flow.product')::uuid)) THEN RAISE EXCEPTION 'Unapproved review was exposed publicly'; END IF;
END $check$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',current_setting('test.flow.owner'),true);
SET LOCAL ROLE authenticated;
SELECT public.owner_moderate_product_review(current_setting('test.flow.review')::uuid,true);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE anon;
DO $check$ BEGIN
 IF (SELECT count(*) FROM public.approved_product_reviews(current_setting('test.flow.product')::uuid))<>1 THEN RAISE EXCEPTION 'Approved customer review missing'; END IF;
END $check$;
SELECT jsonb_build_object('result','PASS','staging_only',true,'catalogue_published',true,'checkout_total_ugx',15000,'empty_stock_completion_blocked',true,'quantity_deducted',2,'review_verified',true,'moderated_and_visible',true,'guest_checkout_blocked',true,'verified_login_required',true,'changes_rolled_back',true) AS commerce_e2e;
ROLLBACK;