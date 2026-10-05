-- DS Bakery v0.38: align staging supplier corrections and approved purchase balances.
-- Does not change environment, Production Lock, or operations_enabled.
ALTER TABLE public.purchase_payments
 ADD COLUMN IF NOT EXISTS edited_at timestamptz,
 ADD COLUMN IF NOT EXISTS edited_by uuid REFERENCES public.profiles(id),
 ADD COLUMN IF NOT EXISTS edit_reason text,
 ADD COLUMN IF NOT EXISTS voided_at timestamptz,
 ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES public.profiles(id),
 ADD COLUMN IF NOT EXISTS void_reason text,
 ADD COLUMN IF NOT EXISTS voided_original_amount numeric(14,2);
ALTER TABLE public.purchase_payments DROP CONSTRAINT IF EXISTS purchase_payments_amount_check;
ALTER TABLE public.purchase_payments ADD CONSTRAINT purchase_payments_amount_check CHECK (
 (voided_at IS NULL AND amount > 0)
 OR (voided_at IS NOT NULL AND amount = 0 AND voided_original_amount > 0)
);
INSERT INTO public.app_permissions(permission_key,description,critical)
VALUES ('records:correct','Edit, void/remove, restore and correct recorded business transactions',true)
ON CONFLICT(permission_key) DO NOTHING;
INSERT INTO public.role_permission_defaults(role,permission_key,allowed) VALUES
 ('owner','records:correct',true),('manager','records:correct',true),
 ('cashier','records:correct',false),('baker','records:correct',false),('storekeeper','records:correct',false)
ON CONFLICT(role,permission_key) DO NOTHING;
CREATE OR REPLACE FUNCTION public.edit_purchase_order(p_purchase_id uuid, p_supplier_id uuid, p_purchase_date date, p_supplier_invoice_no text, p_invoice_date date, p_credit_terms_days integer, p_discount numeric, p_notes text, p_items jsonb, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_before public.purchases%rowtype;
  v_item jsonb;
  v_material_id uuid;
  v_qty numeric;
  v_cost numeric;
begin
  if not public.staff_has_permission('purchases:write') then
    raise exception 'Purchase management permission required';
  end if;
  if coalesce(trim(p_reason),'')='' then raise exception 'Correction reason is required'; end if;
  if not exists(select 1 from public.suppliers where id=p_supplier_id and active=true) then
    raise exception 'Active supplier not found';
  end if;
  if coalesce(p_credit_terms_days,0)<0 then raise exception 'Credit terms cannot be negative'; end if;
  if coalesce(p_discount,0)<0 then raise exception 'Discount cannot be negative'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
    raise exception 'Purchase order needs at least one item';
  end if;

  select * into v_before from public.purchases where id=p_purchase_id for update;
  if not found then raise exception 'Purchase order not found'; end if;
  if v_before.status<>'draft' or v_before.approval_status<>'pending' then
    raise exception 'Only pending draft purchase orders can be edited';
  end if;
  if coalesce(v_before.amount_paid,0)>0 then
    raise exception 'Paid purchase orders cannot be edited';
  end if;
  if exists(select 1 from public.purchase_items where purchase_id=p_purchase_id and received_qty_base>0) then
    raise exception 'Received purchase orders cannot be edited';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_material_id:=(v_item->>'raw_material_id')::uuid;
    v_qty:=(v_item->>'ordered_qty_base')::numeric;
    v_cost:=(v_item->>'unit_cost_base')::numeric;
    if v_qty<=0 then raise exception 'Ordered quantity must be greater than zero'; end if;
    if v_cost<0 then raise exception 'Unit cost cannot be negative'; end if;
    if not exists(select 1 from public.raw_materials where id=v_material_id and status='active') then
      raise exception 'Invalid raw material';
    end if;
  end loop;

  update public.purchases
  set supplier_id=p_supplier_id,
      purchase_date=coalesce(p_purchase_date,public.business_current_date()),
      supplier_invoice_no=nullif(trim(p_supplier_invoice_no),''),
      invoice_date=p_invoice_date,
      credit_terms_days=p_credit_terms_days,
      discount=coalesce(p_discount,0),
      notes=nullif(trim(p_notes),''),
      updated_at=now()
  where id=p_purchase_id;

  delete from public.purchase_items where purchase_id=p_purchase_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.purchase_items(
      purchase_id,raw_material_id,ordered_qty_base,received_qty_base,unit_cost_base,line_total
    ) values(
      p_purchase_id,
      (v_item->>'raw_material_id')::uuid,
      (v_item->>'ordered_qty_base')::numeric,
      0,
      (v_item->>'unit_cost_base')::numeric,
      ((v_item->>'ordered_qty_base')::numeric*(v_item->>'unit_cost_base')::numeric)
    );
  end loop;

  perform public.refresh_purchase_totals(p_purchase_id);

  insert into public.audit_logs(actor_id,action,entity,entity_id,before_data,after_data)
  values(
    auth.uid(),'edit_purchase_order','purchase',p_purchase_id,to_jsonb(v_before),
    jsonb_build_object(
      'supplier_id',p_supplier_id,'purchase_date',p_purchase_date,'supplier_invoice_no',p_supplier_invoice_no,
      'invoice_date',p_invoice_date,'credit_terms_days',p_credit_terms_days,'discount',p_discount,
      'notes',p_notes,'items',p_items,'reason',trim(p_reason)
    )
  );
end;
$function$;
REVOKE ALL ON FUNCTION public.edit_purchase_order(p_purchase_id uuid, p_supplier_id uuid, p_purchase_date date, p_supplier_invoice_no text, p_invoice_date date, p_credit_terms_days integer, p_discount numeric, p_notes text, p_items jsonb, p_reason text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edit_purchase_order(p_purchase_id uuid, p_supplier_id uuid, p_purchase_date date, p_supplier_invoice_no text, p_invoice_date date, p_credit_terms_days integer, p_discount numeric, p_notes text, p_items jsonb, p_reason text) TO authenticated;
CREATE OR REPLACE FUNCTION public.edit_supplier_payment(p_payment_id uuid, p_amount numeric, p_method text, p_reference text, p_shift_id uuid, p_edit_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_old public.purchase_payments%rowtype;
  v_purchase public.purchases%rowtype;
  v_other_paid numeric(14,2);
  v_method text:=lower(trim(p_method));
begin
  if not public.staff_has_permission('records:correct') then
    raise exception 'You do not have permission to correct recorded transactions';
  end if;
  if p_amount<=0 then raise exception 'Payment amount must be greater than zero'; end if;
  if v_method not in ('cash','bank','mtn_momo','airtel_money') then
    raise exception 'Unsupported supplier payment method';
  end if;
  if v_method<>'cash' and coalesce(trim(p_reference),'')='' then
    raise exception 'Reference is required for non-cash supplier payment';
  end if;
  if coalesce(trim(p_edit_reason),'')='' then raise exception 'Correction reason is required'; end if;

  select * into v_old
  from public.purchase_payments
  where id=p_payment_id
  for update;

  if not found then raise exception 'Supplier payment not found'; end if;
  if v_old.voided_at is not null then
    raise exception 'Restore the supplier payment before editing it';
  end if;

  select * into v_purchase
  from public.purchases
  where id=v_old.purchase_id
  for update;

  select coalesce(sum(amount),0)
  into v_other_paid
  from public.purchase_payments
  where purchase_id=v_old.purchase_id and id<>p_payment_id;

  if v_other_paid+p_amount > v_purchase.total_amount then
    raise exception 'Corrected payment would exceed the purchase total';
  end if;

  if p_shift_id is distinct from v_old.shift_id and p_shift_id is not null and not exists(
    select 1 from public.cashier_shifts where id=p_shift_id and status='open'
  ) then
    raise exception 'A supplier payment can only be reassigned to an open cashier shift';
  end if;

  update public.purchase_payments
  set amount=p_amount,
      method=v_method,
      reference=nullif(trim(p_reference),''),
      shift_id=p_shift_id,
      edited_at=now(),
      edited_by=auth.uid(),
      edit_reason=trim(p_edit_reason)
  where id=p_payment_id;

  perform public.refresh_purchase_totals(v_old.purchase_id);

  insert into public.audit_logs(actor_id,action,entity,entity_id,before_data,after_data)
  values(
    auth.uid(),'edit_supplier_payment','purchase_payment',p_payment_id,
    jsonb_build_object(
      'amount',v_old.amount,'method',v_old.method,'reference',v_old.reference,'shift_id',v_old.shift_id
    ),
    jsonb_build_object(
      'amount',p_amount,'method',v_method,'reference',nullif(trim(p_reference),''),
      'shift_id',p_shift_id,'correction_reason',trim(p_edit_reason)
    )
  );
end;
$function$;
REVOKE ALL ON FUNCTION public.edit_supplier_payment(p_payment_id uuid, p_amount numeric, p_method text, p_reference text, p_shift_id uuid, p_edit_reason text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edit_supplier_payment(p_payment_id uuid, p_amount numeric, p_method text, p_reference text, p_shift_id uuid, p_edit_reason text) TO authenticated;
CREATE OR REPLACE FUNCTION public.restore_supplier_payment(p_payment_id uuid, p_restore_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_old public.purchase_payments%rowtype;
  v_purchase public.purchases%rowtype;
  v_other_paid numeric(14,2);
  v_restore numeric(14,2);
begin
  if not public.staff_has_permission('records:correct') then
    raise exception 'You do not have permission to correct recorded transactions';
  end if;
  if coalesce(trim(p_restore_reason),'')='' then raise exception 'Restore reason is required'; end if;

  select * into v_old from public.purchase_payments where id=p_payment_id for update;
  if not found then raise exception 'Supplier payment not found'; end if;
  if v_old.voided_at is null then return; end if;

  v_restore:=v_old.voided_original_amount;
  select * into v_purchase from public.purchases where id=v_old.purchase_id for update;
  select coalesce(sum(amount),0) into v_other_paid
  from public.purchase_payments
  where purchase_id=v_old.purchase_id and id<>p_payment_id;

  if v_other_paid+v_restore > v_purchase.total_amount then
    raise exception 'Restored payment would exceed the purchase total';
  end if;

  update public.purchase_payments
  set amount=v_restore,
      voided_original_amount=null,
      voided_at=null, voided_by=null, void_reason=null,
      edited_at=now(), edited_by=auth.uid(),
      edit_reason='Restored: '||trim(p_restore_reason)
  where id=p_payment_id;

  perform public.refresh_purchase_totals(v_old.purchase_id);

  insert into public.audit_logs(actor_id,action,entity,entity_id,before_data,after_data)
  values(auth.uid(),'restore_supplier_payment','purchase_payment',p_payment_id,
    jsonb_build_object('voided',true,'original_amount',v_restore,'void_reason',v_old.void_reason),
    jsonb_build_object('voided',false,'amount',v_restore,'restore_reason',trim(p_restore_reason))
  );
end;
$function$;
REVOKE ALL ON FUNCTION public.restore_supplier_payment(p_payment_id uuid, p_restore_reason text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_supplier_payment(p_payment_id uuid, p_restore_reason text) TO authenticated;
CREATE OR REPLACE FUNCTION public.void_supplier_payment(p_payment_id uuid, p_void_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_old public.purchase_payments%rowtype;
begin
  if not public.staff_has_permission('records:correct') then
    raise exception 'You do not have permission to correct recorded transactions';
  end if;
  if coalesce(trim(p_void_reason),'')='' then raise exception 'Deletion / void reason is required'; end if;

  select * into v_old from public.purchase_payments where id=p_payment_id for update;
  if not found then raise exception 'Supplier payment not found'; end if;
  if v_old.voided_at is not null then return; end if;

  update public.purchase_payments
  set voided_original_amount=amount,
      amount=0,
      voided_at=now(),
      voided_by=auth.uid(),
      void_reason=trim(p_void_reason)
  where id=p_payment_id;

  perform public.refresh_purchase_totals(v_old.purchase_id);

  insert into public.audit_logs(actor_id,action,entity,entity_id,before_data,after_data)
  values(auth.uid(),'void_supplier_payment','purchase_payment',p_payment_id,
    jsonb_build_object('purchase_id',v_old.purchase_id,'amount',v_old.amount,'method',v_old.method,'reference',v_old.reference),
    jsonb_build_object('voided',true,'effective_amount',0,'original_amount',v_old.amount,'void_reason',trim(p_void_reason))
  );
end;
$function$;
REVOKE ALL ON FUNCTION public.void_supplier_payment(p_payment_id uuid, p_void_reason text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_supplier_payment(p_payment_id uuid, p_void_reason text) TO authenticated;
CREATE OR REPLACE VIEW public.supplier_account_summary WITH (security_invoker = true) AS
 SELECT s.id AS supplier_id,
    s.name AS supplier_name,
    s.phone,
    s.email,
    (COALESCE(sum(
        CASE
            WHEN ((p.status <> 'cancelled'::purchase_status) AND (p.approval_status = 'approved'::po_approval_status)) THEN p.total_amount
            ELSE (0)::numeric
        END), (0)::numeric))::numeric(14,2) AS total_purchases,
    (COALESCE(sum(
        CASE
            WHEN ((p.status <> 'cancelled'::purchase_status) AND (p.approval_status = 'approved'::po_approval_status)) THEN p.amount_paid
            ELSE (0)::numeric
        END), (0)::numeric))::numeric(14,2) AS total_paid,
    (COALESCE(sum(
        CASE
            WHEN ((p.status <> 'cancelled'::purchase_status) AND (p.approval_status = 'approved'::po_approval_status)) THEN (p.total_amount - p.amount_paid)
            ELSE (0)::numeric
        END), (0)::numeric))::numeric(14,2) AS outstanding_balance,
    (COALESCE(sum(
        CASE
            WHEN (((p.status <> 'cancelled'::purchase_status) AND (p.approval_status = 'approved'::po_approval_status)) AND (p.due_date < business_current_date()) AND (p.total_amount > p.amount_paid)) THEN (p.total_amount - p.amount_paid)
            ELSE (0)::numeric
        END), (0)::numeric))::numeric(14,2) AS overdue_balance,
    min(
        CASE
            WHEN (((p.status <> 'cancelled'::purchase_status) AND (p.approval_status = 'approved'::po_approval_status)) AND (p.total_amount > p.amount_paid)) THEN p.due_date
            ELSE NULL::date
        END) AS next_due_date
   FROM (suppliers s
     LEFT JOIN purchases p ON ((p.supplier_id = s.id)))
  WHERE (s.active = true)
  GROUP BY s.id, s.name, s.phone, s.email;
CREATE OR REPLACE VIEW public.supplier_balances WITH (security_invoker = true) AS
 SELECT s.id,
    s.name AS supplier_name,
    s.phone,
    s.email,
    (COALESCE(sum(p.total_amount), (0)::numeric))::numeric(14,2) AS total_purchases,
    (COALESCE(sum(p.amount_paid), (0)::numeric))::numeric(14,2) AS total_paid,
    (COALESCE(sum((p.total_amount - p.amount_paid)), (0)::numeric))::numeric(14,2) AS outstanding_balance
   FROM (suppliers s
     LEFT JOIN purchases p ON (((p.supplier_id = s.id) AND ((p.status <> 'cancelled'::purchase_status) AND (p.approval_status = 'approved'::po_approval_status)))))
  WHERE (s.active = true)
  GROUP BY s.id, s.name, s.phone, s.email;
CREATE OR REPLACE VIEW public.supplier_statement_lines WITH (security_invoker = true) AS
 WITH lines AS (
         SELECT p.supplier_id,
            (p.purchase_date)::timestamp with time zone AS occurred_at,
            'purchase'::text AS line_type,
            p.id AS source_id,
            p.purchase_no AS reference,
            p.supplier_invoice_no,
            p.total_amount AS debit,
            (0)::numeric(14,2) AS credit,
            p.total_amount AS balance_delta,
            NULL::timestamp with time zone AS edited_at,
            NULL::text AS edit_reason,
            NULL::timestamp with time zone AS voided_at,
            NULL::text AS void_reason,
            NULL::numeric(14,2) AS original_amount
           FROM purchases p
          WHERE ((p.status <> 'cancelled'::purchase_status) AND (p.approval_status = 'approved'::po_approval_status))
        UNION ALL
         SELECT p.supplier_id,
            pp.paid_at AS occurred_at,
            'payment'::text AS line_type,
            pp.id AS source_id,
            COALESCE(pp.reference, 'Supplier payment'::text) AS reference,
            p.supplier_invoice_no,
            (0)::numeric(14,2) AS debit,
            pp.amount AS credit,
            ((- pp.amount))::numeric(14,2) AS balance_delta,
            pp.edited_at,
            pp.edit_reason,
            pp.voided_at,
            pp.void_reason,
            pp.voided_original_amount AS original_amount
           FROM (purchase_payments pp
             JOIN purchases p ON ((p.id = pp.purchase_id)))
          WHERE p.status <> 'cancelled'::purchase_status AND p.approval_status = 'approved'::po_approval_status
        )
 SELECT supplier_id,
    occurred_at,
    line_type,
    source_id,
    reference,
    supplier_invoice_no,
    debit,
    credit,
    (sum(balance_delta) OVER (PARTITION BY supplier_id ORDER BY occurred_at, line_type, source_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW))::numeric(14,2) AS running_balance,
    edited_at,
    edit_reason,
    voided_at,
    void_reason,
    original_amount
   FROM lines;
