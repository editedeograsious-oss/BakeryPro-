-- DS Bakery staff realtime alert migration. STAGING tested; review before any production use.
CREATE TABLE IF NOT EXISTS public.staff_notifications(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 event_key text NOT NULL CHECK(length(event_key) BETWEEN 5 AND 180),
 event_type text NOT NULL CHECK(event_type IN('new_order','order_status','low_stock')),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 140),
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 350),
 target_path text NOT NULL CHECK(target_path IN('/customer-orders','/inventory')),
 created_at timestamptz NOT NULL DEFAULT now(),
 read_at timestamptz,
 UNIQUE(recipient_id,event_key)
);
CREATE INDEX IF NOT EXISTS staff_notifications_recipient_recent_idx
 ON public.staff_notifications(recipient_id,created_at DESC);
CREATE INDEX IF NOT EXISTS staff_notifications_unread_idx
 ON public.staff_notifications(recipient_id,created_at DESC) WHERE read_at IS NULL;
ALTER TABLE public.staff_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_notifications FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.staff_notifications TO authenticated;
DROP POLICY IF EXISTS staff_notifications_read_own ON public.staff_notifications;
CREATE POLICY staff_notifications_read_own ON public.staff_notifications FOR SELECT TO authenticated
 USING(recipient_id=(select auth.uid()) AND EXISTS(
  SELECT 1 FROM public.profiles p WHERE p.id=(select auth.uid())
  AND p.active AND p.disabled_at IS NULL
 ));
CREATE OR REPLACE FUNCTION public.enqueue_staff_notifications(p_event text, p_type text, p_title text, p_body text, p_path text, p_roles staff_role[], p_branch uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 INSERT INTO public.staff_notifications(recipient_id,event_key,event_type,title,body,target_path)
 SELECT p.id,p_event,p_type,left(p_title,140),left(p_body,350),p_path
 FROM public.profiles p
 WHERE p.active AND p.disabled_at IS NULL
 AND p.role=ANY(p_roles)
 AND (p_branch IS NULL OR p.role='owner' OR p.branch_id IS NULL OR p.branch_id=p_branch)
 ON CONFLICT(recipient_id,event_key) DO NOTHING;
END;$function$;

CREATE OR REPLACE FUNCTION public.mark_all_staff_notifications_read()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE count_rows integer;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles p
     WHERE p.id=auth.uid() AND p.active AND p.disabled_at IS NULL) THEN
   RAISE EXCEPTION 'Active staff authentication required';
 END IF;
 UPDATE public.staff_notifications SET read_at=now()
 WHERE recipient_id=auth.uid() AND read_at IS NULL;
 GET DIAGNOSTICS count_rows=ROW_COUNT;
 RETURN count_rows;
END;$function$;

CREATE OR REPLACE FUNCTION public.mark_staff_notification_read(p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles p
     WHERE p.id=auth.uid() AND p.active AND p.disabled_at IS NULL) THEN
   RAISE EXCEPTION 'Active staff authentication required';
 END IF;
 UPDATE public.staff_notifications SET read_at=now()
 WHERE id=p_id AND recipient_id=auth.uid() AND read_at IS NULL;
 RETURN FOUND;
END;$function$;

CREATE OR REPLACE FUNCTION public.staff_notify_low_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 IF NEW.status='active'
  AND NEW.current_stock_qty <= NEW.low_stock_threshold
  AND (OLD.current_stock_qty > OLD.low_stock_threshold OR OLD.status IS DISTINCT FROM NEW.status) THEN
   PERFORM public.enqueue_staff_notifications(
     'stock:low:'||NEW.id::text||':'||to_char(now(),'YYYYMMDDHH24MISSUS'),
     'low_stock','Low stock: '||NEW.name,
     left(NEW.name,130)||' has '||NEW.current_stock_qty::text||' '||NEW.base_unit::text||
       ' remaining (minimum '||NEW.low_stock_threshold::text||').',
     '/inventory',
     ARRAY['owner','manager','storekeeper']::public.staff_role[],NULL
   );
 END IF;
 RETURN NEW;
END;$function$;

CREATE OR REPLACE FUNCTION public.staff_notify_order_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_status text;
BEGIN
 IF TG_OP='INSERT' THEN
   PERFORM public.enqueue_staff_notifications(
     'order:new:'||NEW.id::text,'new_order','New bakery order',
     'Order '||coalesce(NEW.order_no,'')||' is awaiting confirmation.',
     '/customer-orders',
     ARRAY['owner','manager','cashier']::public.staff_role[],NEW.branch_id
   );
 ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
   v_status:=replace(NEW.status::text,'_',' ');
   PERFORM public.enqueue_staff_notifications(
     'order:status:'||NEW.id::text||':'||NEW.status::text,
     'order_status','Order status updated',
     'Order '||coalesce(NEW.order_no,'')||' is now '||v_status||'.',
     '/customer-orders',
     ARRAY['owner','manager','cashier','baker']::public.staff_role[],NEW.branch_id
   );
 END IF;
 RETURN NEW;
END;$function$;

REVOKE ALL ON FUNCTION public.mark_staff_notification_read(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.mark_all_staff_notifications_read() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mark_staff_notification_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_staff_notifications_read() TO authenticated;
REVOKE ALL ON FUNCTION public.enqueue_staff_notifications(text,text,text,text,text,public.staff_role[],uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staff_notify_order_changes() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staff_notify_low_stock() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS staff_notify_order_changes_trigger ON public.customer_orders;
CREATE TRIGGER staff_notify_order_changes_trigger AFTER INSERT OR UPDATE OF status ON public.customer_orders
 FOR EACH ROW EXECUTE FUNCTION public.staff_notify_order_changes();
DROP TRIGGER IF EXISTS staff_notify_low_stock_trigger ON public.raw_materials;
CREATE TRIGGER staff_notify_low_stock_trigger AFTER UPDATE OF current_stock_qty,low_stock_threshold,status ON public.raw_materials
 FOR EACH ROW EXECUTE FUNCTION public.staff_notify_low_stock();
DO $pub$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime'
 AND schemaname='public' AND tablename='staff_notifications') THEN
 ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_notifications;
 END IF;
END $pub$;
