-- DS Bakery STAGING ONLY: customer commerce v0.39 (not approved for production).
-- owner_set_product_image embeds the staging Supabase URL; adjust for production.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS online_available boolean NOT NULL DEFAULT false;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('bakery-product-images','bakery-product-images',true,5242880,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public=true,file_size_limit=5242880,allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp'];
DROP POLICY IF EXISTS "bakery_product_images_public_read" ON storage.objects;
CREATE POLICY "bakery_product_images_public_read" ON storage.objects FOR SELECT TO anon,authenticated USING(bucket_id='bakery-product-images');
DROP POLICY IF EXISTS "bakery_product_images_owner_upload" ON storage.objects;
CREATE POLICY "bakery_product_images_owner_upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='bakery-product-images' AND public.current_staff_role()='owner'::public.staff_role);
DROP POLICY IF EXISTS "bakery_product_images_owner_delete" ON storage.objects;
CREATE POLICY "bakery_product_images_owner_delete" ON storage.objects FOR DELETE TO authenticated USING(bucket_id='bakery-product-images' AND public.current_staff_role()='owner'::public.staff_role);
CREATE TABLE IF NOT EXISTS public.product_reviews(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),product_id uuid NOT NULL REFERENCES public.products(id),
 order_id uuid NOT NULL REFERENCES public.customer_orders(id),rating integer NOT NULL CHECK(rating BETWEEN 1 AND 5),
 display_name text NOT NULL CHECK(char_length(display_name) BETWEEN 2 AND 80),
 review_text text NOT NULL CHECK(char_length(review_text) BETWEEN 10 AND 500),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 created_at timestamptz NOT NULL DEFAULT now(),moderated_at timestamptz,
 moderated_by uuid REFERENCES public.profiles(id),
 CONSTRAINT product_review_one_per_order UNIQUE(product_id,order_id)
);
CREATE INDEX IF NOT EXISTS product_reviews_approved_idx ON public.product_reviews(product_id,created_at DESC) WHERE status='approved';
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_reviews FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.product_reviews TO authenticated;
DROP POLICY IF EXISTS "product_reviews_owner_read" ON public.product_reviews;
CREATE POLICY "product_reviews_owner_read" ON public.product_reviews FOR SELECT TO authenticated USING(public.current_staff_role()='owner'::public.staff_role);

CREATE OR REPLACE FUNCTION public.approved_product_reviews(p_product_id uuid)
 RETURNS TABLE(rating integer, display_name text, review_text text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 SELECT r.rating,r.display_name,r.review_text,r.created_at
 FROM public.product_reviews r JOIN public.products p ON p.id=r.product_id
 WHERE r.product_id=p_product_id AND r.status='approved' AND p.status='active' AND p.online_available
 ORDER BY r.created_at DESC LIMIT 30;
$function$

CREATE OR REPLACE FUNCTION public.owner_moderate_product_review(p_review_id uuid, p_approve boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 IF public.current_staff_role()<>'owner'::public.staff_role THEN RAISE EXCEPTION 'CEO access required'; END IF;
 UPDATE public.product_reviews SET status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
 moderated_at=now(),moderated_by=auth.uid() WHERE id=p_review_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Review not found'; END IF;
 INSERT INTO public.audit_logs(actor_id,action,entity,entity_id,after_data)
 VALUES(auth.uid(),'moderate_product_review','product_review',p_review_id,jsonb_build_object('approved',p_approve));
END;$function$

CREATE OR REPLACE FUNCTION public.owner_set_product_image(p_product_id uuid, p_path text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_url text;
BEGIN
 IF public.current_staff_role()<>'owner'::public.staff_role THEN RAISE EXCEPTION 'CEO access required'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.products WHERE id=p_product_id) THEN RAISE EXCEPTION 'Product not found'; END IF;
 IF p_path IS NULL OR p_path !~ ('^'||p_product_id::text||'/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$') THEN
   RAISE EXCEPTION 'Invalid product image path'; END IF;
 IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='bakery-product-images' AND name=p_path) THEN
   RAISE EXCEPTION 'The image must be uploaded before publishing'; END IF;
 v_url:='https://kymadepeuqhcsjwbrgqq.supabase.co/storage/v1/object/public/bakery-product-images/'||p_path;
 UPDATE public.products SET image_url=v_url,updated_at=now() WHERE id=p_product_id;
 INSERT INTO public.audit_logs(actor_id,action,entity,entity_id,after_data)
 VALUES (auth.uid(),'set_product_image','product',p_product_id,jsonb_build_object('storage_path',p_path));
END;$function$

CREATE OR REPLACE FUNCTION public.owner_set_product_online(p_product_id uuid, p_available boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 IF public.current_staff_role()<>'owner'::public.staff_role THEN RAISE EXCEPTION 'CEO access required'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.products WHERE id=p_product_id AND status='active' AND selling_price>=0) THEN
  RAISE EXCEPTION 'Product must be active and have a valid price'; END IF;
 IF p_available AND NOT EXISTS (SELECT 1 FROM public.products WHERE id=p_product_id AND nullif(trim(image_url),'') IS NOT NULL) THEN
  RAISE EXCEPTION 'Upload a product photo before publishing'; END IF;
 UPDATE public.products SET online_available=p_available,updated_at=now() WHERE id=p_product_id;
 INSERT INTO public.audit_logs(actor_id,action,entity,entity_id,after_data)
 VALUES (auth.uid(),'set_online_product_availability','product',p_product_id,jsonb_build_object('online_available',p_available));
END;$function$

CREATE OR REPLACE FUNCTION public.public_product_catalog()
 RETURNS TABLE(id uuid, name text, description text, selling_price numeric, image_url text, category_name text, category_display_order integer, product_updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
SELECT p.id,p.name,p.description,p.selling_price,p.image_url,pc.name,coalesce(pc.display_order,0),p.updated_at
FROM public.products p LEFT JOIN public.product_categories pc ON pc.id=p.category_id
WHERE p.status='active' AND p.online_available
ORDER BY coalesce(pc.display_order,0),pc.name NULLS LAST,p.name;
$function$

CREATE OR REPLACE FUNCTION public.submit_public_order(p_full_name text, p_phone text, p_email text, p_fulfillment fulfillment_type, p_required_at timestamp with time zone, p_delivery_address text, p_notes text, p_items jsonb, p_client_request_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_customer uuid;v_order uuid:=gen_random_uuid();v_order_no text;v_item jsonb;v_product record;v_qty numeric;v_existing uuid;
begin
  if not public.public_ordering_status() then raise exception 'Online ordering is not currently available'; end if;
  if coalesce(trim(p_full_name),'')='' or coalesce(trim(p_phone),'')='' then raise exception 'Name and phone are required'; end if;
  if p_required_at<=now() then raise exception 'Required date/time must be in the future'; end if;
  if p_fulfillment='delivery' and coalesce(trim(p_delivery_address),'')='' then raise exception 'Delivery address is required'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>20 then raise exception 'Order must contain 1 to 20 products'; end if;
  if p_client_request_id is not null then select id into v_existing from public.customer_orders where client_request_id=p_client_request_id; if v_existing is not null then return jsonb_build_object('order_id',v_existing,'order_no',(select order_no from public.customer_orders where id=v_existing),'duplicate',true); end if; end if;
  select id into v_customer from public.customers where phone=trim(p_phone) limit 1;
  if v_customer is null then
    insert into public.customers(full_name,phone,email,address,active,created_by)
    values(trim(p_full_name),trim(p_phone),nullif(trim(p_email),''),case when p_fulfillment='delivery' then nullif(trim(p_delivery_address),'') end,true,null)
    returning id into v_customer;
  else
    update public.customers set full_name=coalesce(nullif(trim(p_full_name),''),full_name),email=coalesce(nullif(trim(p_email),''),email),updated_at=now() where id=v_customer;
  end if;
  v_order_no:=public.next_customer_order_no();
  insert into public.customer_orders(id,order_no,customer_id,status,fulfillment,required_at,delivery_address,notes,created_by,client_request_id,order_source)
  values(v_order,v_order_no,v_customer,'pending',p_fulfillment,p_required_at,case when p_fulfillment='delivery' then nullif(trim(p_delivery_address),'') end,nullif(trim(p_notes),''),null,p_client_request_id,'public_web');
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
end;$function$

CREATE OR REPLACE FUNCTION public.submit_verified_product_review(p_order_no text, p_phone text, p_product_id uuid, p_rating integer, p_display_name text, p_review_text text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_order_id uuid;v_id uuid;
BEGIN
 IF p_rating NOT BETWEEN 1 AND 5 OR length(btrim(coalesce(p_display_name,''))) NOT BETWEEN 2 AND 80
    OR length(btrim(coalesce(p_review_text,''))) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'Rating, display name or review length is invalid'; END IF;
 IF length(btrim(coalesce(p_order_no,'')))>50 OR length(btrim(coalesce(p_phone,'')))>30 THEN
    RAISE EXCEPTION 'Order reference is invalid'; END IF;
 SELECT o.id INTO v_order_id FROM public.customer_orders o JOIN public.customers c ON c.id=o.customer_id
 WHERE o.order_no=btrim(p_order_no) AND c.phone=btrim(p_phone) AND o.status='completed'::public.customer_order_status
 AND EXISTS(SELECT 1 FROM public.customer_order_items i WHERE i.order_id=o.id AND i.product_id=p_product_id)
 LIMIT 1;
 IF v_order_id IS NULL THEN RAISE EXCEPTION 'Only customers with a completed order may review this product'; END IF;
 INSERT INTO public.product_reviews (product_id,order_id,rating,display_name,review_text)
 VALUES(p_product_id,v_order_id,p_rating,btrim(p_display_name),btrim(p_review_text))
 ON CONFLICT (product_id,order_id) DO NOTHING RETURNING id INTO v_id;
 IF v_id IS NULL THEN RAISE EXCEPTION 'This product has already been reviewed for that order'; END IF;
 RETURN v_id;
END;$function$

REVOKE ALL ON FUNCTION public.owner_set_product_online(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.owner_set_product_online(uuid,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.owner_set_product_image(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.owner_set_product_image(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.owner_moderate_product_review(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.owner_moderate_product_review(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_verified_product_review(text,text,uuid,integer,text,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.approved_product_reviews(uuid) TO anon,authenticated;
