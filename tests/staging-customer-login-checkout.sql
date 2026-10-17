BEGIN;
DO $assert$ BEGIN
 IF (SELECT environment_mode FROM public.system_environment_config WHERE id=1) <> 'staging' THEN RAISE EXCEPTION 'Staging only'; END IF;
END $assert$;
SET LOCAL ROLE anon;
DO $assert$ DECLARE blocked boolean:=false;BEGIN
 BEGIN PERFORM public.submit_public_order('Test','0700011223',null,'pickup',now()+interval '2 days',null,null,'[]'::jsonb,gen_random_uuid());
 EXCEPTION WHEN insufficient_privilege OR raise_exception THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Guest order bypassed authentication';END IF;
END $assert$;
RESET ROLE;
SELECT set_config('test.login.email',(SELECT u.email FROM public.profiles p JOIN auth.users u ON u.id=p.id
 WHERE p.role='owner' AND p.active AND p.disabled_at IS NULL AND u.email_confirmed_at IS NOT NULL LIMIT 1),true);
SELECT set_config('request.jwt.claim.sub',(SELECT p.id::text FROM public.profiles p JOIN auth.users u ON u.id=p.id
 WHERE p.role='owner' AND p.active AND p.disabled_at IS NULL AND u.email_confirmed_at IS NOT NULL LIMIT 1),true);
SET LOCAL ROLE authenticated;
SELECT set_config('test.login.product',public.save_product(NULL::uuid,'ROLLBACK CUSTOMER LOGIN Bakery Bread',NULL::uuid,7000,'Rollback test')::text,true);
RESET ROLE;
UPDATE public.products SET image_url='https://example.test/image-placeholder.jpg' WHERE id=current_setting('test.login.product')::uuid;
SET LOCAL ROLE authenticated;
SELECT public.owner_set_product_online(current_setting('test.login.product')::uuid,true);
SELECT set_config('test.login.order',public.submit_public_order(
 'ROLLBACK TEST CLIENT','07'||substr(md5(gen_random_uuid()::text),1,12),
 current_setting('test.login.email'),
 'pickup',now()+interval '2 days',null,'Only test data',jsonb_build_array(jsonb_build_object('product_id',current_setting('test.login.product'),'quantity',2)),gen_random_uuid()
)::text,true);
DO $assert$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.customer_order_accounts WHERE order_id=(current_setting('test.login.order')::jsonb->>'order_id')::uuid AND auth_user_id=auth.uid()) THEN RAISE EXCEPTION 'Order not linked to verified account'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.customer_my_orders() WHERE order_no=current_setting('test.login.order')::jsonb->>'order_no') THEN RAISE EXCEPTION 'Customer cannot see own order'; END IF;
END $assert$;
RESET ROLE;
SELECT jsonb_build_object('status','PASS','anonymous_order_denied',true,'verified_customer_order',true,'linked_private_history',true,'rolled_back',true) AS customer_auth_test;
ROLLBACK;