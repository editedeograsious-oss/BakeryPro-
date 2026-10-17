-- DS Bakery v0.38: authenticated staff attribution in CEO/manager notifications.
-- Apply to staging only. No historical transactions are replayed.
DO $stage$ BEGIN
  IF (SELECT environment_mode FROM public.system_environment_config WHERE id=1)
     IS DISTINCT FROM 'staging' THEN RAISE EXCEPTION 'Staging only'; END IF;
END $stage$;

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

ALTER TABLE public.staff_notifications
 ADD COLUMN IF NOT EXISTS actor_id uuid,
 ADD COLUMN IF NOT EXISTS actor_name text,
 ADD COLUMN IF NOT EXISTS actor_role text,
 ADD COLUMN IF NOT EXISTS source_audit_id bigint;

-- Enrich existing order and low-stock alerts with the session's *trusted*
-- profile, never a name supplied by the browser.
CREATE OR REPLACE FUNCTION public.enqueue_staff_notifications(
 p_event text,p_type text,p_title text,p_body text,p_path text,
 p_roles public.staff_role[],p_branch uuid DEFAULT NULL::uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public,pg_temp AS $fn$
BEGIN
 INSERT INTO public.staff_notifications
   (recipient_id,event_key,event_type,title,body,target_path,
    actor_id,actor_name,actor_role)
 SELECT recipient.id,p_event,p_type,left(p_title,140),left(p_body,350),p_path,
    actor.id,actor.full_name,actor.role::text
 FROM public.profiles recipient
 LEFT JOIN public.profiles actor ON actor.id=auth.uid()
    AND actor.active AND actor.disabled_at IS NULL
 WHERE recipient.active AND recipient.disabled_at IS NULL
   AND recipient.role=ANY(p_roles)
   AND (p_branch IS NULL OR recipient.role='owner'
        OR recipient.branch_id IS NULL OR recipient.branch_id=p_branch)
 ON CONFLICT(recipient_id,event_key) DO NOTHING;
END;
$fn$;
REVOKE ALL ON FUNCTION public.enqueue_staff_notifications(text,text,text,text,text,public.staff_role[],uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_staff_notifications(text,text,text,text,text,public.staff_role[],uuid)
 TO service_role;

-- All staff-attributed business events are selected from trusted audit records.
-- Idempotency is guaranteed by the existing (recipient_id,event_key) UNIQUE key.
CREATE OR REPLACE FUNCTION public.ds_notify_audited_transaction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public,pg_temp AS $fn$
DECLARE
 v_name text;
 v_role text;
 v_role_label text;
 v_type text;
 v_title text;
 v_path text;
 v_amount text;
 v_ref text;
 v_detail text;
 v_recipients public.staff_role[];
 v_impact text;
BEGIN
 IF NEW.action NOT IN (
   'complete_sale','void_sale','refund_sale','record_sale_refund',
   'record_cash_movement','void_cash_movement','edit_cash_movement',
   'record_expense','edit_expense','void_expense','restore_expense',
   'receive_stock','stock_count_adjustment','manual_finished_stock_in',
   'record_waste','confirm_production',
   'create_purchase_order','approve_purchase_order','record_supplier_payment',
   'edit_supplier_payment','void_supplier_payment','restore_supplier_payment',
   'record_customer_order_payment','edit_customer_order_payment',
   'void_customer_order_payment','restore_customer_order_payment',
   'close_business_day','record_salary_advance','pay_salary',
   'reverse_payroll_payment','restore_payroll_payment','generate_payroll',
   'record_payment','record_credit_payment',
   'create_product','create_raw_material','move_to_recycle_bin',
   'restore_from_recycle_bin','purge_recycled_record'
 ) THEN RETURN NEW; END IF;

 SELECT left(p.full_name,120),p.role::text
 INTO v_name,v_role FROM public.profiles p WHERE p.id=NEW.actor_id;

 v_role_label:=CASE v_role
  WHEN 'owner' THEN 'CEO / Owner'
  WHEN 'manager' THEN 'General Manager'
  WHEN 'cashier' THEN 'Cashier'
  WHEN 'baker' THEN 'Baker'
  WHEN 'storekeeper' THEN 'Stock Manager'
  WHEN 'viewer' THEN 'View-Only Staff'
  ELSE NULL END;

 -- Clear distinction between a real authenticated staff identity and no actor.
 IF v_name IS NULL THEN
   v_name:=NULL;
   v_role_label:=NULL;
 END IF;

 v_path:=CASE NEW.entity
   WHEN 'sale' THEN '/pos'
   WHEN 'sale_refund' THEN '/pos'
   WHEN 'cash_movement' THEN '/cash-movements'
   WHEN 'expense' THEN '/expenses'
   WHEN 'inventory_transaction' THEN '/stock-movements'
   WHEN 'purchase_receipt' THEN '/purchases'
   WHEN 'finished_goods_batch' THEN '/finished-goods'
   WHEN 'waste_event' THEN '/waste'
   WHEN 'production_run' THEN '/production'
   WHEN 'purchase' THEN '/purchase-orders'
   WHEN 'purchase_payment' THEN '/supplier-accounts'
   WHEN 'customer_order_payment' THEN '/customer-orders'
   WHEN 'daily_closing' THEN '/daily-closing'
   WHEN 'payroll_item' THEN '/payroll'
   WHEN 'salary_advance' THEN '/payroll'
   WHEN 'payroll_run' THEN '/payroll'
   WHEN 'product' THEN '/products'
   WHEN 'raw_material' THEN '/inventory'
   ELSE '/activity-log' END;

 v_type:='transaction';
 v_title:=CASE NEW.action
   WHEN 'complete_sale' THEN 'Sale completed'
   WHEN 'record_cash_movement' THEN 'Cash movement recorded'
   WHEN 'record_expense' THEN 'Expense recorded'
   WHEN 'void_expense' THEN 'Expense voided'
   WHEN 'restore_expense' THEN 'Expense restored'
   WHEN 'receive_stock' THEN 'Stock received'
   WHEN 'stock_count_adjustment' THEN 'Stock count adjusted'
   WHEN 'manual_finished_stock_in' THEN 'Finished goods added'
   WHEN 'record_waste' THEN 'Waste recorded'
   WHEN 'confirm_production' THEN 'Production confirmed'
   WHEN 'create_purchase_order' THEN 'Purchase order created'
   WHEN 'approve_purchase_order' THEN 'Purchase order approved'
   WHEN 'record_supplier_payment' THEN 'Supplier payment recorded'
   WHEN 'edit_supplier_payment' THEN 'Supplier payment corrected'
   WHEN 'void_supplier_payment' THEN 'Supplier payment voided'
   WHEN 'restore_supplier_payment' THEN 'Supplier payment restored'
   WHEN 'record_customer_order_payment' THEN 'Order payment recorded'
   WHEN 'close_business_day' THEN 'Daily closing recorded'
   WHEN 'pay_salary' THEN 'Salary payment recorded'
   ELSE initcap(replace(NEW.action,'_',' ')) END;

 v_amount:=CASE
   WHEN jsonb_typeof(NEW.after_data->'total')='number'
       THEN NEW.after_data->>'total'
   WHEN jsonb_typeof(NEW.after_data->'amount')='number'
       THEN NEW.after_data->>'amount'
   WHEN jsonb_typeof(NEW.after_data->'total_cost')='number'
       THEN NEW.after_data->>'total_cost'
   ELSE NULL END;
 v_ref:=coalesce(
   nullif(left(NEW.after_data->>'sale_no',45),''),
   nullif(left(NEW.after_data->>'order_no',45),''),
   nullif(left(NEW.after_data->>'purchase_no',45),'')
 );
 v_detail:=concat_ws(' • ',
   CASE WHEN v_amount IS NOT NULL THEN 'UGX '||left(v_amount,25) ELSE NULL END,
   CASE WHEN v_ref IS NOT NULL THEN 'Ref: '||v_ref ELSE NULL END,
   CASE WHEN NEW.after_data ? 'quantity_received'
       THEN 'Quantity: '||left(NEW.after_data->>'quantity_received',20)
     WHEN NEW.after_data ? 'quantity_produced'
       THEN 'Quantity: '||left(NEW.after_data->>'quantity_produced',20)
     WHEN NEW.after_data ? 'quantity'
       THEN 'Quantity: '||left(NEW.after_data->>'quantity',20)
     ELSE NULL END
 );
 IF coalesce(v_detail,'')='' THEN
   v_detail:='Activity: '||replace(NEW.entity,'_',' ');
 END IF;
 v_recipients:=CASE
   WHEN NEW.entity IN ('payroll_item','payroll_run','salary_advance')
     THEN ARRAY['owner']::public.staff_role[]
   ELSE ARRAY['owner','manager']::public.staff_role[]
   END;

 INSERT INTO public.staff_notifications
    (recipient_id,event_key,event_type,title,body,target_path,
     actor_id,actor_name,actor_role,source_audit_id)
 SELECT recipient.id,'audit:business:'||NEW.id::text,v_type,left(v_title,140),
   left(v_detail,350),v_path,
   CASE WHEN v_name IS NULL THEN NULL ELSE NEW.actor_id END,
   v_name,v_role_label,NEW.id
 FROM public.profiles recipient
 WHERE recipient.active AND recipient.disabled_at IS NULL
   AND recipient.role=ANY(v_recipients)
 ON CONFLICT(recipient_id,event_key) DO NOTHING;

 RETURN NEW;
EXCEPTION WHEN OTHERS THEN
 -- Notification outages should never reverse a committed financial posting.
 RAISE WARNING 'DS Bakery transaction notice not delivered for audit event %: %',
   NEW.id,SQLERRM;
 RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.ds_notify_audited_transaction() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ds_notify_audited_transaction() TO service_role;
DROP TRIGGER IF EXISTS ds_notify_audited_transaction_trigger ON public.audit_logs;
CREATE TRIGGER ds_notify_audited_transaction_trigger
 AFTER INSERT ON public.audit_logs FOR EACH ROW
 EXECUTE FUNCTION public.ds_notify_audited_transaction();
