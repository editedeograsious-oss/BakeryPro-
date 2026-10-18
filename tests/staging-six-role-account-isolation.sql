-- DS Bakery staging-only six-role authorization regression.
-- No staff password, auth session, production account or live business data is changed.
-- Temporary view-only role simulation is rolled back.
BEGIN;
DO $guard$ BEGIN
 IF (SELECT environment_mode FROM public.system_environment_config WHERE id=1)
    IS DISTINCT FROM 'staging' THEN RAISE EXCEPTION 'Staging only'; END IF;
END $guard$;
SELECT set_config('qa.owner',(SELECT id::text FROM public.profiles WHERE role='owner' AND active LIMIT 1),true);
SELECT set_config('qa.manager',(SELECT id::text FROM public.profiles WHERE role='manager' AND active LIMIT 1),true);
SELECT set_config('qa.cashier',(SELECT id::text FROM public.profiles WHERE role='cashier' AND active ORDER BY id LIMIT 1),true);
SELECT set_config('qa.baker',(SELECT id::text FROM public.profiles WHERE role='baker' AND active LIMIT 1),true);
SELECT set_config('qa.storekeeper',(SELECT id::text FROM public.profiles WHERE role='storekeeper' AND active LIMIT 1),true);
UPDATE public.profiles SET role='viewer'::public.staff_role
 WHERE id=current_setting('qa.cashier')::uuid;
SET LOCAL ROLE authenticated;
DO $run$
DECLARE v_role text; v_id text; v_test text; v_denied boolean; v_result text;
BEGIN
 FOREACH v_role IN ARRAY ARRAY['owner','manager','viewer','baker','storekeeper'] LOOP
   v_id:=current_setting('qa.'||CASE WHEN v_role='viewer' THEN 'cashier' ELSE v_role END);
   PERFORM set_config('request.jwt.claim.sub',v_id,true);
   IF public.current_staff_role()::text IS DISTINCT FROM v_role
   THEN RAISE EXCEPTION 'Mismatch: current_staff_role for %',v_role; END IF;
   IF v_role='viewer' THEN
     IF public.is_active_staff() OR NOT public.is_active_viewer()
     OR public.staff_has_permission('inventory:write') THEN
       RAISE EXCEPTION 'Viewer inherited operational grants'; END IF;
     IF (SELECT count(*) FROM public.ds_sync_revision)<>2 THEN
       RAISE EXCEPTION 'Viewer revision isolation failed'; END IF;
     PERFORM public.viewer_product_stock();
   ELSE
     IF NOT public.is_active_staff() OR public.is_active_viewer() THEN
       RAISE EXCEPTION 'Operational staff role denied: %',v_role; END IF;
     IF (SELECT count(*) FROM public.ds_sync_revision WHERE module='finance')
       <> (CASE WHEN v_role IN ('owner','manager') THEN 1 ELSE 0 END)
     THEN RAISE EXCEPTION 'Finance revision leakage for %',v_role; END IF;
   END IF;
   IF v_role<>'owner' THEN
     v_denied:=false;
     BEGIN PERFORM public.set_staff_active(current_setting('qa.owner')::uuid,false);
     EXCEPTION WHEN OTHERS THEN v_denied:=SQLERRM ILIKE '%Only owner may%'; END;
     IF NOT v_denied THEN RAISE EXCEPTION '% can change owner account',v_role; END IF;
   END IF;
   IF v_role IN ('viewer','baker','storekeeper') THEN
     v_denied:=false;
     BEGIN PERFORM public.complete_sale_v038('[]'::jsonb,0,NULL,'[]'::jsonb);
     EXCEPTION WHEN OTHERS THEN v_denied:=SQLERRM ILIKE '%Not authorized to create sales%'; END;
     IF NOT v_denied THEN RAISE EXCEPTION '% can initiate POS sale',v_role; END IF;
     v_denied:=false;
     BEGIN PERFORM public.record_cash_movement('cash_in'::public.cash_movement_type,100,'Staging QA only');
     EXCEPTION WHEN OTHERS THEN v_denied:=SQLERRM ILIKE '%Not authorized to record cash movements%'; END;
     IF NOT v_denied THEN RAISE EXCEPTION '% can post cash movement',v_role; END IF;
   END IF;
   IF v_role IN ('viewer','baker') THEN
     v_denied:=false;
     BEGIN PERFORM public.record_stock_count(gen_random_uuid(),1,'Staging QA');
     EXCEPTION WHEN OTHERS THEN v_denied:=SQLERRM ILIKE '%Not authorized to post stock counts%'; END;
     IF NOT v_denied THEN RAISE EXCEPTION '% can post inventory stock count',v_role; END IF;
     v_denied:=false;
     BEGIN PERFORM public.create_purchase_order(gen_random_uuid(),CURRENT_DATE,NULL,CURRENT_DATE,0,0,'qa','[]'::jsonb);
     EXCEPTION WHEN OTHERS THEN v_denied:=SQLERRM ILIKE '%Not authorized to create purchase orders%'; END;
     IF NOT v_denied THEN RAISE EXCEPTION '% can create purchase order',v_role; END IF;
   END IF;
   IF v_role IN ('viewer','baker','storekeeper') THEN
     v_denied:=false;
     BEGIN PERFORM public.pay_payroll_item(gen_random_uuid(),'cash'::public.payment_method,NULL);
     EXCEPTION WHEN OTHERS THEN v_denied:=SQLERRM ILIKE '%Payroll permission required%'; END;
     IF NOT v_denied THEN RAISE EXCEPTION '% can initiate payroll payments',v_role; END IF;
   END IF;
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub',current_setting('qa.manager'),true);
 IF NOT public.staff_has_permission('finance:read') OR public.staff_has_permission('security:manage')
 THEN RAISE EXCEPTION 'Manager has incorrect finance or security policy'; END IF;
 PERFORM set_config('request.jwt.claim.sub',current_setting('qa.storekeeper'),true);
 IF NOT public.staff_has_permission('inventory:write')
 OR NOT public.staff_has_permission('purchases:write')
 OR public.staff_has_permission('payroll:manage') THEN
   RAISE EXCEPTION 'Stock manager permissions unexpected'; END IF;
END $run$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS' AS staging_six_role_account_denial_matrix;
