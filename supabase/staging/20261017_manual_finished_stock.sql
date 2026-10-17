-- DS Bakery: manual CEO finished-goods intake (currently tested on STAGING ONLY).
-- IMPORTANT: migrate to production only after cutover review, never automatically.
-- Manual stock batches are distinguished from actual production records,
-- but share batch allocation, POS availability and unit-cost accounting.
ALTER TABLE public.finished_goods_batches ALTER COLUMN production_run_id DROP NOT NULL;
ALTER TABLE public.finished_goods_batches
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS manual_reason text,
  ADD COLUMN IF NOT EXISTS recorded_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS client_request_id uuid;
DO $constraint$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='finished_goods_batches_source_integrity'
  AND conrelid='public.finished_goods_batches'::regclass) THEN
  ALTER TABLE public.finished_goods_batches ADD CONSTRAINT finished_goods_batches_source_integrity
  CHECK (
   (source_type='production' AND production_run_id IS NOT NULL AND manual_reason IS NULL)
   OR (source_type='manual' AND production_run_id IS NULL
     AND manual_reason IS NOT NULL AND char_length(btrim(manual_reason)) BETWEEN 10 AND 300
     AND recorded_by IS NOT NULL AND client_request_id IS NOT NULL)
  );
 END IF;
END;$constraint$;
CREATE UNIQUE INDEX IF NOT EXISTS finished_goods_manual_request_key
 ON public.finished_goods_batches(client_request_id) WHERE client_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.owner_add_finished_stock(p_product_id uuid, p_quantity numeric, p_unit_cost numeric, p_stock_date date, p_reason text, p_client_request_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing public.finished_goods_batches%rowtype;
  v_batch_id uuid;
  v_branch uuid;
  v_price numeric;
BEGIN
  IF auth.uid() IS NULL OR public.current_staff_role()<>'owner'::public.staff_role THEN
    RAISE EXCEPTION 'Only an active CEO / Owner may add manual finished stock';
  END IF;
  PERFORM public.assert_business_operation_allowed();
  IF p_product_id IS NULL OR p_client_request_id IS NULL OR p_quantity IS NULL
     OR p_unit_cost IS NULL OR p_stock_date IS NULL THEN
    RAISE EXCEPTION 'All stock details are required';
  END IF;
  IF p_quantity<=0 OR p_quantity<>trunc(p_quantity) OR p_quantity>100000 THEN
    RAISE EXCEPTION 'Finished stock quantity must be a whole number between 1 and 100000';
  END IF;
  IF p_unit_cost<0.01 OR p_unit_cost>100000000 THEN
    RAISE EXCEPTION 'Unit production/acquisition cost must be a positive amount';
  END IF;
  IF p_stock_date>(now() AT TIME ZONE 'Africa/Kampala')::date
     OR p_stock_date<((now() AT TIME ZONE 'Africa/Kampala')::date-interval '365 days')::date THEN
    RAISE EXCEPTION 'Stock date must be within the last 365 days and cannot be in the future';
  END IF;
  IF length(btrim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 300 THEN
    RAISE EXCEPTION 'Provide a stock source/reason between 10 and 300 characters';
  END IF;

  SELECT * INTO v_existing FROM public.finished_goods_batches
  WHERE client_request_id=p_client_request_id;
  IF FOUND THEN
    IF v_existing.source_type='manual'
      AND v_existing.recorded_by=auth.uid()
      AND v_existing.product_id=p_product_id
      AND v_existing.quantity_produced=p_quantity
      AND v_existing.unit_cost=p_unit_cost
      AND v_existing.production_date=p_stock_date
      AND v_existing.manual_reason=btrim(p_reason)
    THEN RETURN v_existing.id;
    END IF;
    RAISE EXCEPTION 'A different stock entry already uses this request ID';
  END IF;

  SELECT selling_price INTO v_price FROM public.products
    WHERE id=p_product_id AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose an active finished product'; END IF;
  v_branch:=public.current_staff_branch_id();
  IF v_branch IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.branches WHERE id=v_branch AND active=true
  ) THEN RAISE EXCEPTION 'A valid active bakery branch is required'; END IF;

  INSERT INTO public.finished_goods_batches(
    batch_no,production_run_id,product_id,production_date,quantity_produced,
    quantity_available,batch_cost,unit_cost,branch_id,
    source_type,manual_reason,recorded_by,client_request_id
  ) VALUES (
    'MAN-'||to_char(now() AT TIME ZONE 'Africa/Kampala','YYYYMMDD')||'-'
       ||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),
    NULL,p_product_id,p_stock_date,p_quantity,p_quantity,
    round(p_quantity*p_unit_cost,2),p_unit_cost,v_branch,
    'manual',btrim(p_reason),auth.uid(),p_client_request_id
  ) RETURNING id INTO v_batch_id;

  INSERT INTO public.audit_logs(actor_id,action,entity,entity_id,after_data)
  VALUES (auth.uid(),'manual_finished_stock_in',
    'finished_goods_batch',v_batch_id,
    jsonb_build_object('product_id',p_product_id,'quantity',p_quantity,
      'unit_cost',p_unit_cost,'stock_date',p_stock_date,'reason',btrim(p_reason),
      'branch_id',v_branch,'source_type','manual'));
  RETURN v_batch_id;
EXCEPTION WHEN unique_violation THEN
  -- Repeated network requests can race; only identical client requests may reuse a result.
  SELECT * INTO v_existing FROM public.finished_goods_batches
  WHERE client_request_id=p_client_request_id;
  IF FOUND AND v_existing.source_type='manual'
    AND v_existing.recorded_by=auth.uid() AND v_existing.product_id=p_product_id
    AND v_existing.quantity_produced=p_quantity
    AND v_existing.unit_cost=p_unit_cost
    AND v_existing.production_date=p_stock_date AND v_existing.manual_reason=btrim(p_reason)
  THEN RETURN v_existing.id; END IF;
  RAISE;
END;$function$;

REVOKE ALL ON FUNCTION public.owner_add_finished_stock(uuid,numeric,numeric,date,text,uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.owner_add_finished_stock(uuid,numeric,numeric,date,text,uuid)
  TO authenticated;
