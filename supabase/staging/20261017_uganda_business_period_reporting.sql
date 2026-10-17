-- DS Bakery staging: align all report day/week/month boundaries to Uganda EAT.
-- UTC remains the storage timezone; the result is the UTC instant of EAT midnight.
CREATE OR REPLACE FUNCTION public.period_start(p_period text)
RETURNS timestamptz
LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $f$
BEGIN
 CASE p_period
  WHEN 'day' THEN RETURN date_trunc('day', now() AT TIME ZONE 'Africa/Kampala') AT TIME ZONE 'Africa/Kampala';
  WHEN 'week' THEN RETURN date_trunc('week', now() AT TIME ZONE 'Africa/Kampala') AT TIME ZONE 'Africa/Kampala';
  WHEN 'month' THEN RETURN date_trunc('month', now() AT TIME ZONE 'Africa/Kampala') AT TIME ZONE 'Africa/Kampala';
  ELSE RAISE EXCEPTION 'Unsupported period';
 END CASE;
END;
$f$;

DO $check$
BEGIN
 IF public.period_start('day')<>date_trunc('day',now() AT TIME ZONE 'Africa/Kampala') AT TIME ZONE 'Africa/Kampala' THEN
  RAISE EXCEPTION 'EAT reporting boundary mismatch';
 END IF;
END;
$check$;
