-- Retain correction metadata in the staging expense ledger; keep RLS active.
create or replace view public.expense_live_summary with (security_invoker=true) as
 SELECT e.id,
    business_date(e.created_at) AS business_date,
    e.category,
    e.description,
    e.amount,
    e.payment_method,
    e.reference,
    e.shift_id,
    cs.cashier_id AS shift_cashier_id,
    cp.full_name AS shift_label,
    e.created_by,
    rp.full_name AS recorded_by_name,
    e.created_at,
    e.voided_at,
    e.voided_by,
    e.void_reason,
    e.edited_at,
    e.edited_by,
    ep.full_name AS edited_by_name,
    e.edit_reason
   FROM ((((expenses e
     LEFT JOIN profiles rp ON ((rp.id = e.created_by)))
     LEFT JOIN cashier_shifts cs ON ((cs.id = e.shift_id)))
     LEFT JOIN profiles cp ON ((cp.id = cs.cashier_id)))
     LEFT JOIN profiles ep ON ((ep.id = e.edited_by)));