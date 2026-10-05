-- DS Bakery staging purchase regression: all transactional changes roll back.
-- Requires existing STAGING TEST Supplier, STAGING TEST Flour, Owner and Cashier test profiles.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"e66ef29d-a4e0-4529-ac2d-f719714c1688","role":"authenticated"}',true);
DO $audit$
DECLARE
  v_po uuid; v_line uuid; v_pay uuid; v_receipt uuid; v_stock numeric; v_base numeric; v_balance numeric; v_row record;
  v_blocked boolean; v_results jsonb := '[]'::jsonb;
  v_supplier uuid := 'b975c2ef-70fa-4ce5-a1bc-30e034fc0caf';
  v_material uuid := '683fea75-629b-4305-b212-a16711c2f255';
BEGIN
  IF current_staff_role() <> 'owner' OR (SELECT environment_mode FROM system_environment_config WHERE id=1) <> 'staging'
    THEN RAISE EXCEPTION 'Audit must run as staging Owner'; END IF;
  SELECT current_stock_qty INTO v_stock FROM raw_materials WHERE id=v_material;
  SELECT outstanding_balance INTO v_base FROM supplier_account_summary WHERE supplier_id=v_supplier;
  v_po := create_purchase_order(v_supplier,business_current_date(),'STAGING AUDIT ROLLBACK',business_current_date(),7,0,'STAGING audit: rollback after assertions',
    jsonb_build_array(jsonb_build_object('raw_material_id',v_material,'ordered_qty_base',50,'unit_cost_base',3000)),gen_random_uuid());
  SELECT id INTO v_line FROM purchase_items WHERE purchase_id=v_po;
  SELECT * INTO v_row FROM purchases WHERE id=v_po;
  IF v_row.status <> 'draft' OR v_row.approval_status <> 'pending' OR v_row.total_amount <> 150000 THEN RAISE EXCEPTION 'Draft mismatch'; END IF;
  IF (SELECT current_stock_qty FROM raw_materials WHERE id=v_material) <> v_stock THEN RAISE EXCEPTION 'Draft altered stock'; END IF;
  IF (SELECT outstanding_balance FROM supplier_account_summary WHERE supplier_id=v_supplier) <> v_base THEN RAISE EXCEPTION 'Draft counted as supplier debt'; END IF;
  v_results := v_results || jsonb_build_array(jsonb_build_object('step','draft purchase','total',150000,'stock_unchanged',true,'excluded_from_supplier_debt',true));
  PERFORM edit_purchase_order(v_po,v_supplier,business_current_date(),'STAGING AUDIT EDIT',business_current_date(),7,0,'STAGING audit corrected draft',
    jsonb_build_array(jsonb_build_object('raw_material_id',v_material,'ordered_qty_base',50,'unit_cost_base',3000)),'Staging draft correction test');
  SELECT id INTO v_line FROM purchase_items WHERE purchase_id=v_po;
  v_blocked := false;
  BEGIN PERFORM receive_purchase_item(v_line,1,gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN v_blocked := SQLERRM LIKE '%approved before receiving%'; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Unapproved receipt not blocked'; END IF;
  SELECT id INTO v_line FROM purchase_items WHERE purchase_id=v_po;
  PERFORM decide_purchase_order(v_po,'approve','Staging audit approval');
  IF (SELECT status FROM purchases WHERE id=v_po) <> 'ordered' THEN RAISE EXCEPTION 'Approval mismatch'; END IF;
  IF NOT EXISTS(SELECT 1 FROM purchase_receiving_lines WHERE purchase_id=v_po AND remaining_qty_base=50) THEN RAISE EXCEPTION 'Approved receipt not visible'; END IF;
  v_results := v_results || jsonb_build_array(jsonb_build_object('step','approval','receivable_kg',50));
  v_receipt := gen_random_uuid();
  PERFORM receive_purchase_item(v_line,20,v_receipt);
  PERFORM receive_purchase_item(v_line,20,v_receipt);
  IF (SELECT current_stock_qty FROM raw_materials WHERE id=v_material) <> v_stock+20 THEN RAISE EXCEPTION 'Receipt duplicated'; END IF;
  IF (SELECT status FROM purchases WHERE id=v_po) <> 'partially_received' THEN RAISE EXCEPTION 'Partial receipt mismatch'; END IF;
  v_blocked := false;
  BEGIN PERFORM receive_purchase_item(v_line,31,gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN v_blocked := SQLERRM LIKE '%more than remaining%'; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Over-receipt not blocked'; END IF;
  PERFORM receive_purchase_item(v_line,30,gen_random_uuid());
  IF (SELECT current_stock_qty FROM raw_materials WHERE id=v_material) <> v_stock+50 THEN RAISE EXCEPTION 'Stock increase mismatch'; END IF;
  IF (SELECT status FROM purchases WHERE id=v_po) <> 'received' THEN RAISE EXCEPTION 'Receipt status mismatch'; END IF;
  IF EXISTS(SELECT 1 FROM purchase_receiving_lines WHERE purchase_id=v_po) THEN RAISE EXCEPTION 'Completed receipt still shown'; END IF;
  v_results := v_results || jsonb_build_array(jsonb_build_object('step','goods receipt','received_kg',50,'stock_before',v_stock,'stock_after',v_stock+50,'idempotent_retry',true,'over_receipt_blocked',true));
  v_receipt := gen_random_uuid();
  v_pay := record_supplier_payment(v_po,60000,'bank','STAGING-AUDIT-PAY',null,v_receipt);
  IF record_supplier_payment(v_po,60000,'bank','STAGING-AUDIT-PAY',null,v_receipt) <> v_pay THEN RAISE EXCEPTION 'Payment retry duplicated'; END IF;
  IF (SELECT amount_paid FROM purchases WHERE id=v_po) <> 60000 THEN RAISE EXCEPTION 'Payment total mismatch'; END IF;
  v_results := v_results || jsonb_build_array(jsonb_build_object('step','supplier payment','paid',60000,'owed',90000,'idempotent_retry',true));
  PERFORM edit_supplier_payment(v_pay,50000,'bank','STAGING-AUDIT-EDIT',null,'Staging audit edit');
  IF (SELECT amount_paid FROM purchases WHERE id=v_po) <> 50000 THEN RAISE EXCEPTION 'Edit balance mismatch'; END IF;
  v_results := v_results || jsonb_build_array(jsonb_build_object('step','edit payment','paid',50000,'owed',100000));
  PERFORM void_supplier_payment(v_pay,'Staging audit void');
  PERFORM void_supplier_payment(v_pay,'Staging audit repeated void');
  IF (SELECT amount_paid FROM purchases WHERE id=v_po) <> 0 THEN RAISE EXCEPTION 'Void balance mismatch'; END IF;
  IF (SELECT voided_original_amount FROM purchase_payments WHERE id=v_pay) <> 50000 THEN RAISE EXCEPTION 'Void lost original amount'; END IF;
  v_results := v_results || jsonb_build_array(jsonb_build_object('step','void payment','paid',0,'owed',150000,'original_amount_retained',50000));
  PERFORM restore_supplier_payment(v_pay,'Staging audit restore');
  PERFORM restore_supplier_payment(v_pay,'Staging audit repeated restore');
  IF (SELECT amount_paid FROM purchases WHERE id=v_po) <> 50000 THEN RAISE EXCEPTION 'Restore balance mismatch'; END IF;
  v_results := v_results || jsonb_build_array(jsonb_build_object('step','restore payment','paid',50000,'owed',100000));
  v_blocked := false;
  BEGIN PERFORM edit_supplier_payment(v_pay,150001,'bank','STAGING-AUDIT-OVER',null,'Overpayment test');
  EXCEPTION WHEN OTHERS THEN v_blocked := SQLERRM LIKE '%exceed%'; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Overpayment not blocked'; END IF;
  PERFORM set_config('request.jwt.claims','{"sub":"b2931c2c-243c-40a6-9c40-6a156d54d1dc","role":"authenticated"}',true);
  v_blocked := false;
  BEGIN PERFORM void_supplier_payment(v_pay,'Unauthorized cashier audit');
  EXCEPTION WHEN OTHERS THEN v_blocked := SQLERRM LIKE '%permission%'; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Cashier correction permission not blocked'; END IF;
  PERFORM set_config('request.jwt.claims','{"sub":"e66ef29d-a4e0-4529-ac2d-f719714c1688","role":"authenticated"}',true);
  SELECT outstanding_balance INTO v_balance FROM supplier_account_summary WHERE supplier_id=v_supplier;
  IF v_balance <> v_base+100000 THEN RAISE EXCEPTION 'Supplier aggregate mismatch'; END IF;
  IF (SELECT running_balance FROM supplier_statement_lines WHERE supplier_id=v_supplier ORDER BY occurred_at DESC,line_type DESC,source_id DESC LIMIT 1) <> v_balance THEN RAISE EXCEPTION 'Statement and balance disagree'; END IF;
  IF (SELECT current_stock_qty FROM raw_materials WHERE id=v_material) <> v_stock+50 THEN RAISE EXCEPTION 'Payment corrections changed stock'; END IF;
  v_results := v_results || jsonb_build_array(jsonb_build_object('step','controls and reconciliation','overpayment_blocked',true,'cashier_correction_blocked',true,'statement_matches_balance',true,'payment_corrections_leave_stock_unchanged',true));
  PERFORM set_config('ds_audit.results',v_results::text,true);
END;
$audit$;
SELECT current_setting('ds_audit.results')::jsonb AS audit_results;
ROLLBACK;