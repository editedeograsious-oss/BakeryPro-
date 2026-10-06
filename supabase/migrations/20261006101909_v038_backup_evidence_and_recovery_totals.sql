-- v0.38: reconcile recovery totals and require latest matching backup evidence.
CREATE OR REPLACE FUNCTION public.backup_recovery_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_latest_backup jsonb;
  v_latest_verify jsonb;
  v_latest_restore jsonb;
  v_archive_ready boolean;
  v_restore_pass boolean;
begin
  if public.current_staff_role() not in ('owner','manager') then
    raise exception 'Owner or manager access required';
  end if;

  select to_jsonb(x) into v_latest_backup from (
    select id,status,backup_label,checksum,notes,recorded_at
    from public.backup_recovery_events where event_type='backup_created'
    order by recorded_at desc,id desc limit 1
  ) x;
  select to_jsonb(x) into v_latest_verify from (
    select id,status,backup_label,checksum,notes,recorded_at
    from public.backup_recovery_events where event_type='backup_verified'
    order by recorded_at desc,id desc limit 1
  ) x;
  select to_jsonb(x) into v_latest_restore from (
    select id,status,backup_label,checksum,notes,recorded_at
    from public.backup_recovery_events where event_type='restore_drill'
    order by recorded_at desc,id desc limit 1
  ) x;

  v_archive_ready:=coalesce(
    v_latest_backup->>'status'='pass'
    and v_latest_verify->>'status'='pass'
    and coalesce(trim(v_latest_backup->>'backup_label'),'')<>''
    and v_latest_backup->>'backup_label'=v_latest_verify->>'backup_label'
    and lower(v_latest_backup->>'checksum') ~ '^[0-9a-f]{64}$'
    and lower(v_latest_backup->>'checksum')=lower(v_latest_verify->>'checksum')
    and (v_latest_backup->>'recorded_at')::timestamptz<=(v_latest_verify->>'recorded_at')::timestamptz,
    false);
  v_restore_pass:=coalesce(
    v_archive_ready
    and v_latest_restore->>'status'='pass'
    and v_latest_restore->>'backup_label'=v_latest_backup->>'backup_label'
    and lower(v_latest_restore->>'checksum')=lower(v_latest_backup->>'checksum')
    and (v_latest_verify->>'recorded_at')::timestamptz<=(v_latest_restore->>'recorded_at')::timestamptz,
    false);

  return jsonb_build_object(
    'strategy','supabase_cli_logical_backup_plus_provider_backup',
    'latest_backup',v_latest_backup,
    'latest_backup_verification',v_latest_verify,
    'latest_restore_drill',v_latest_restore,
    'archive_evidence_ready',v_archive_ready,
    'restore_drill_passed',v_restore_pass,
    'go_live_backup_gate',case when v_restore_pass then 'pass' else 'pending' end
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_backup_recovery_event(p_event_type text, p_status text, p_backup_label text DEFAULT NULL::text, p_checksum text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid:=gen_random_uuid();
begin
  if public.current_staff_role()<>'owner' then
    raise exception 'Only owner may record backup/recovery evidence';
  end if;

  if p_event_type not in ('plan_prepared','backup_created','backup_verified','restore_drill') then
    raise exception 'Invalid backup/recovery event type';
  end if;
  if p_status not in ('pass','warn','fail') then
    raise exception 'Invalid backup/recovery event status';
  end if;

  if p_status='pass' and p_event_type<>'plan_prepared' then
    if coalesce(trim(p_backup_label),'')='' then
      raise exception 'A backup label is required for passing backup and restore evidence';
    end if;
    if coalesce(lower(trim(p_checksum)),'') !~ '^[0-9a-f]{64}$' then
      raise exception 'The archive SHA-256 checksum is required for passing backup and restore evidence';
    end if;
  end if;

  insert into public.backup_recovery_events(
    id,event_type,status,backup_label,checksum,notes,recorded_by,recorded_at
  )
  values(
    v_id,p_event_type,p_status,
    nullif(trim(p_backup_label),''),
    nullif(lower(trim(p_checksum)),''),
    nullif(trim(p_notes),''),
    auth.uid(),clock_timestamp()
  );

  insert into public.audit_logs(actor_id,action,entity,entity_id,after_data)
  values(
    auth.uid(),'record_backup_recovery_event','backup_recovery_event',v_id,
    jsonb_build_object(
      'event_type',p_event_type,
      'status',p_status,
      'backup_label',p_backup_label,
      'checksum',p_checksum
    )
  );

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.recovery_verification_manifest()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_release public.system_release_state%rowtype;
begin
  if public.current_staff_role() not in ('owner','manager') then
    raise exception 'Owner or manager access required';
  end if;

  select * into v_release from public.system_release_state where id=1;

  return jsonb_build_object(
    'generated_at',now(),
    'app_version',v_release.app_version,
    'latest_migration',v_release.latest_migration,
    'release_stage',v_release.release_stage,
    'critical_counts',jsonb_build_object(
      'profiles',(select count(*) from public.profiles),
      'products',(select count(*) from public.products),
      'raw_materials',(select count(*) from public.raw_materials),
      'suppliers',(select count(*) from public.suppliers),
      'recipes',(select count(*) from public.recipes),
      'purchases',(select count(*) from public.purchases),
      'inventory_transactions',(select count(*) from public.inventory_transactions),
      'production_runs',(select count(*) from public.production_runs),
      'waste_events',(select count(*) from public.waste_events),
      'customers',(select count(*) from public.customers),
      'customer_orders',(select count(*) from public.customer_orders),
      'sales',(select count(*) from public.sales),
      'payments',(select count(*) from public.payments),
      'expenses',(select count(*) from public.expenses),
      'audit_logs',(select count(*) from public.audit_logs)
    ),
    'integrity',jsonb_build_object(
      'negative_stock_count',(select count(*) from public.raw_materials where current_stock_qty<0),
      'active_owner_count',(select count(*) from public.profiles where active=true and disabled_at is null and role='owner'),
      'open_cashier_shift_count',(select count(*) from public.cashier_shifts where status='open'),
      'mobile_money_conflict_count',(select count(*) from public.mobile_money_reference_conflicts),
      'validation_pass_count',(select count(*) from public.validation_runs where overall_status='pass' and completed_at is not null)
    ),
    'financial_totals',jsonb_build_object(
      'completed_sales_total',(select coalesce(sum(total),0) from public.sales where status='completed'),
      'completed_payments_total',(select coalesce(sum(amount),0) from public.payments where status='completed'),
      'customer_order_payments_total',(select coalesce(sum(amount),0) from public.customer_order_payments where payment_status='completed'),
      'expenses_total',(select coalesce(sum(amount),0) from public.expenses where voided_at is null)
    )
  );
end;
$function$;
