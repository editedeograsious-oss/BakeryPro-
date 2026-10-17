-- DS Bakery staging: verified customer checkout + shared data.
-- REVIEW BEFORE PRODUCTION. Customer Auth redirect allowlist and email confirmation must be configured.
CREATE TABLE IF NOT EXISTS public.customer_order_accounts(
 order_id uuid PRIMARY KEY REFERENCES public.customer_orders(id) ON DELETE CASCADE,
 auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_order_accounts_owner_idx ON public.customer_order_accounts(auth_user_id,created_at DESC);
ALTER TABLE public.customer_order_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_order_accounts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.customer_order_accounts TO authenticated;
DROP POLICY IF EXISTS customer_order_accounts_read_self ON public.customer_order_accounts;
CREATE POLICY customer_order_accounts_read_self ON public.customer_order_accounts FOR SELECT
 TO authenticated USING(auth_user_id=(SELECT auth.uid()));
CREATE OR REPLACE FUNCTION public.customer_my_orders()
 RETURNS TABLE(order_no text, status text, fulfillment text, total_amount numeric, created_at timestamp with time zone, required_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 SELECT o.order_no,o.status::text,o.fulfillment::text,o.total_amount,o.created_at,o.required_at
 FROM public.customer_orders o
 JOIN public.customer_order_accounts l ON l.order_id=o.id
 WHERE l.auth_user_id=auth.uid() AND auth.uid() IS NOT NULL
 ORDER BY o.created_at DESC LIMIT 50;
$function$;

CREATE OR REPLACE FUNCTION public.submit_public_order(p_full_name text, p_phone text, p_email text, p_fulfillment fulfillment_type, p_required_at timestamp with time zone, p_delivery_address text, p_notes text, p_items jsonb, p_client_request_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_customer uuid;v_order uuid:=gen_random_uuid();v_order_no text;v_item jsonb;v_product record;v_qty numeric;v_existing uuid;v_account_id uuid;v_verified_email text;v_stored_email text;
begin
  v_account_id:=auth.uid();
  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'Please sign in to your customer account before placing an order';
  END IF;
  SELECT lower(email) INTO v_verified_email FROM auth.users
    WHERE id=v_account_id AND email_confirmed_at IS NOT NULL;
  IF v_verified_email IS NULL THEN
    RAISE EXCEPTION 'Please verify your email before placing an order';
  END IF;
  IF nullif(trim(coalesce(p_email,'')),'') IS NOT NULL
      AND lower(trim(p_email))<>v_verified_email THEN
    RAISE EXCEPTION 'Order email must match your verified account email';
  END IF;
  if not public.public_ordering_status() then raise exception 'Online ordering is not currently available'; end if;
  if coalesce(trim(p_full_name),'')='' or coalesce(trim(p_phone),'')='' then raise exception 'Name and phone are required'; end if;
  if p_required_at is null or p_required_at<=now() then raise exception 'Required date/time must be in the future'; end if;
  if p_fulfillment='delivery' and (not coalesce((select delivery_enabled from public.public_site_settings where id=1),false) or coalesce(trim(p_delivery_address),'')='') then raise exception 'Delivery address is required'; end if;
  if coalesce(jsonb_typeof(p_items),'null')<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>20 then raise exception 'Order must contain 1 to 20 products'; end if;
  if p_client_request_id is not null then select id into v_existing from public.customer_orders where client_request_id=p_client_request_id; if v_existing is not null then
  IF NOT EXISTS (SELECT 1 FROM public.customer_order_accounts
    WHERE order_id=v_existing AND auth_user_id=v_account_id) THEN
      RAISE EXCEPTION 'That order request ID belongs to another account';
  END IF;
  return jsonb_build_object('order_id',v_existing,'order_no',
    (select order_no from public.customer_orders where id=v_existing),'duplicate',true);
 end if; end if;
  select id,email into v_customer,v_stored_email from public.customers where phone=trim(p_phone) limit 1;
  if v_customer is null then
    insert into public.customers(full_name,phone,email,address,active,created_by)
    values(trim(p_full_name),trim(p_phone),v_verified_email,case when p_fulfillment='delivery' then nullif(trim(p_delivery_address),'') end,true,null)
    returning id into v_customer;
  else
    IF v_stored_email IS NULL OR lower(trim(v_stored_email))<>v_verified_email THEN
      RAISE EXCEPTION 'This phone is linked to another customer record. Contact DS Bakery to verify ownership.';
    END IF;
  end if;
  v_order_no:=public.next_customer_order_no();
  insert into public.customer_orders(id,order_no,customer_id,status,fulfillment,required_at,delivery_address,notes,created_by,client_request_id,order_source)
  values(v_order,v_order_no,v_customer,'pending',p_fulfillment,p_required_at,case when p_fulfillment='delivery' then nullif(trim(p_delivery_address),'') end,nullif(trim(p_notes),''),null,p_client_request_id,'public_web');
  INSERT INTO public.customer_order_accounts(order_id,auth_user_id)
    VALUES(v_order,v_account_id);
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty:=coalesce((v_item->>'quantity')::numeric,0);
    if v_qty<=0 or v_qty>100 then raise exception 'Invalid order quantity'; end if;
    select id,name,selling_price into v_product from public.products where id=(v_item->>'product_id')::uuid and status='active' and online_available;
    if v_product.id is null then raise exception 'One of the selected products is unavailable'; end if;
    insert into public.customer_order_items(order_id,product_id,description,quantity,unit_price,line_total)
    values(v_order,v_product.id,v_product.name,v_qty,v_product.selling_price,round(v_qty*v_product.selling_price,2));
  end loop;
  perform public.refresh_customer_order_total(v_order);
  insert into public.audit_logs(actor_id,action,entity,entity_id,after_data)
  values(null,'public_online_order','customer_order',v_order,jsonb_build_object('order_no',v_order_no,'customer_id',v_customer,'source','public_web'));
  return jsonb_build_object('order_id',v_order,'order_no',v_order_no,'total',(select total_amount from public.customer_orders where id=v_order),'duplicate',false);
end;$function$;

REVOKE ALL ON FUNCTION public.submit_public_order(text,text,text,public.fulfillment_type,timestamptz,text,text,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_public_order(text,text,text,public.fulfillment_type,timestamptz,text,text,jsonb,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.customer_my_orders() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.customer_my_orders() TO authenticated;
DO $pub$ DECLARE tbl text;BEGIN
 FOREACH tbl IN ARRAY ARRAY['sales','products','raw_materials','customer_orders'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=tbl) THEN
   EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',tbl);
  END IF;
 END LOOP;
END $pub$;
