DO $stage$ BEGIN IF (SELECT environment_mode FROM public.system_environment_config WHERE id=1) IS DISTINCT FROM 'staging' THEN RAISE EXCEPTION 'Staging only'; END IF; END $stage$;
ALTER TABLE public.staff_notifications
 DROP CONSTRAINT IF EXISTS staff_notifications_event_type_check,
 ADD CONSTRAINT staff_notifications_event_type_check
 CHECK (event_type IN ('new_order','order_status','low_stock','transaction'));

ALTER TABLE public.staff_notifications
 DROP CONSTRAINT IF EXISTS staff_notifications_target_path_check,
 ADD CONSTRAINT staff_notifications_target_path_check
 CHECK (target_path IN (
   '/customer-orders','/inventory','/pos','/cash-movements','/expenses',
   '/stock-movements','/purchases','/finished-goods','/waste','/production',
   '/purchase-orders','/supplier-accounts','/daily-closing','/payroll',
   '/products','/activity-log'
 ));

