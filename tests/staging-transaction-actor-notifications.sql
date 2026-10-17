-- DS Bakery v0.38 attributable transaction alerts.
-- Test fixtures and notifications are rolled back, never retained.
BEGIN;
DO $guard$ BEGIN
 IF (SELECT environment_mode FROM public.system_environment_config WHERE id=1) <> 'staging'
 THEN RAISE EXCEPTION 'STAGING ONLY'; END IF;
END $guard$;
SELECT set_config('qa.owner',(SELECT id::text FROM public.profiles WHERE role='owner' AND active LIMIT 1),true);
SELECT set_config('qa.manager',(SELECT id::text FROM public.profiles WHERE role='manager' AND active LIMIT 1),true);
SELECT set_config('qa.cashier',(SELECT id::text FROM public.profiles WHERE role='cashier' AND active LIMIT 1),true);
DO $qa$
DECLARE saleid bigint; salaryid bigint; expected_name text;
BEGIN
 SELECT full_name INTO expected_name FROM public.profiles WHERE id=current_setting('qa.cashier')::uuid;
 INSERT INTO public.audit_logs(actor_id,action,entity,entity_id,after_data)
 VALUES(current_setting('qa.cashier')::uuid,'complete_sale','sale',gen_random_uuid(),
 jsonb_build_object('total',24500,'sale_no','QA-STAGING-TRANSACTION-001'))
 RETURNING id INTO saleid;
 IF (SELECT count(*) FROM public.staff_notifications WHERE source_audit_id=saleid)<>2
 THEN RAISE EXCEPTION 'Sale must notify CEO and manager'; END IF;
 IF EXISTS (SELECT 1 FROM public.staff_notifications WHERE source_audit_id=saleid
 AND (actor_id IS DISTINCT FROM current_setting('qa.cashier')::uuid
 OR actor_name IS DISTINCT FROM expected_name OR actor_role IS DISTINCT FROM 'Cashier'
 OR target_path IS DISTINCT FROM '/pos' OR body NOT LIKE '%24500%'
 OR body NOT LIKE '%QA-STAGING-TRANSACTION-001%'
 OR event_type IS DISTINCT FROM 'transaction'))
 THEN RAISE EXCEPTION 'Sale staff attribution or details incorrect'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.staff_notifications WHERE source_audit_id=saleid
 AND recipient_id=current_setting('qa.owner')::uuid)
 OR NOT EXISTS (SELECT 1 FROM public.staff_notifications WHERE source_audit_id=saleid
 AND recipient_id=current_setting('qa.manager')::uuid)
 THEN RAISE EXCEPTION 'CEO/manager recipient mismatch'; END IF;
 INSERT INTO public.audit_logs(actor_id,action,entity,entity_id,after_data)
 VALUES(current_setting('qa.cashier')::uuid,'pay_salary','payroll_item',gen_random_uuid(),
 jsonb_build_object('amount',24500)) RETURNING id INTO salaryid;
 IF (SELECT count(*) FROM public.staff_notifications WHERE source_audit_id=salaryid)<>1
 OR (SELECT recipient_id FROM public.staff_notifications WHERE source_audit_id=salaryid)
 IS DISTINCT FROM current_setting('qa.owner')::uuid
 THEN RAISE EXCEPTION 'Payroll notification was not CEO only'; END IF;
 INSERT INTO public.staff_notifications
 (recipient_id,event_key,event_type,title,body,target_path,source_audit_id)
 SELECT recipient_id,event_key,event_type,title,body,target_path,source_audit_id
 FROM public.staff_notifications WHERE source_audit_id=saleid
 ON CONFLICT(recipient_id,event_key) DO NOTHING;
 IF (SELECT count(*) FROM public.staff_notifications WHERE source_audit_id=saleid)<>2
 THEN RAISE EXCEPTION 'Idempotent retries duplicated notifications'; END IF;
 PERFORM set_config('qa.saleid',saleid::text,true);
END $qa$;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.cashier'),true);
SET LOCAL ROLE authenticated;
DO $rbac$ BEGIN
 IF EXISTS(SELECT 1 FROM public.staff_notifications
 WHERE source_audit_id=current_setting('qa.saleid')::bigint)
 THEN RAISE EXCEPTION 'Cashier read private management notification'; END IF;
END $rbac$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS' AS transaction_notification_attribution_privacy_and_dedupe;
