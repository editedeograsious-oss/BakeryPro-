-- STAGING ONLY. Show POS staff the same finished-goods quantity that the
-- atomic sale allocation trigger uses. Inventory cannot be created by this RPC.
CREATE OR REPLACE FUNCTION public.pos_available_finished_stock()
RETURNS TABLE(product_id uuid, available_quantity numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $f$
BEGIN
  IF public.current_staff_role() NOT IN ('owner','manager','cashier') THEN
    RAISE EXCEPTION 'Not authorized to view POS stock';
  END IF;
  RETURN QUERY
  SELECT p.id,
    coalesce(sum(greatest(coalesce(b.quantity_available,0),0)),0)::numeric
  FROM public.products p
  LEFT JOIN public.finished_goods_batches b
    ON b.product_id=p.id AND b.quantity_available>0
  WHERE p.status='active'
  GROUP BY p.id;
END;
$f$;
REVOKE ALL ON FUNCTION public.pos_available_finished_stock() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_available_finished_stock() TO authenticated;
