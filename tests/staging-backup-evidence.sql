begin;
do $guard$ begin if (select environment_mode from public.system_environment_config where id=1)<>'staging' then raise exception 'This regression test requires staging';end if;end $guard$;
select set_config('request.jwt.claim.sub','e66ef29d-a4e0-4529-ac2d-f719714c1688',true);
set local role authenticated;
do $test$
declare result jsonb;
begin
  if (public.recovery_verification_manifest()->'financial_totals'->>'expenses_total')::numeric<>(select coalesce(sum(amount),0) from public.expenses where voided_at is null) then raise exception 'Recovery expense total mismatch';end if;
  begin
    perform public.record_backup_recovery_event('restore_drill','pass','ROLLBACK-ONLY-CHECK',null,'Regression test only');
    raise exception 'Missing checksum evidence accepted';
  exception when others then
    if sqlerrm<>'The archive SHA-256 checksum is required for passing backup and restore evidence' then raise;end if;
  end;
  perform public.record_backup_recovery_event('backup_created','pass','ROLLBACK-ONLY-CHECK',repeat('a',64),'Regression test only');
  perform public.record_backup_recovery_event('backup_verified','pass','ROLLBACK-ONLY-CHECK',repeat('a',64),'Regression test only');
  perform public.record_backup_recovery_event('restore_drill','pass','ROLLBACK-ONLY-CHECK',repeat('a',64),'Regression test only');
  result:=public.backup_recovery_status();
  if result->>'go_live_backup_gate'<>'pass' then raise exception 'Matching latest evidence did not pass';end if;
  perform public.record_backup_recovery_event('restore_drill','fail','ROLLBACK-ONLY-CHECK',repeat('a',64),'Regression test only');
  result:=public.backup_recovery_status();
  if result->>'go_live_backup_gate'='pass' or (result->>'restore_drill_passed')::boolean then raise exception 'Old pass hides latest failed restore';end if;
  perform public.record_backup_recovery_event('restore_drill','pass','ROLLBACK-ONLY-CHECK',repeat('b',64),'Regression test only');
  if public.backup_recovery_status()->>'go_live_backup_gate'='pass' then raise exception 'Mismatched checksum passed';end if;
  perform public.record_backup_recovery_event('restore_drill','pass','DIFFERENT-ARCHIVE',repeat('a',64),'Regression test only');
  if public.backup_recovery_status()->>'go_live_backup_gate'='pass' then raise exception 'Mismatched archive label passed';end if;
  perform public.record_backup_recovery_event('backup_created','pass','NEWER-ARCHIVE',repeat('c',64),'Regression test only');
  if public.backup_recovery_status()->>'go_live_backup_gate'='pass' then raise exception 'Old restore validates newer archive';end if;
end $test$;
select jsonb_build_object('result','PASS','checks',array['voided expenses excluded','checksum required','current matching evidence passes','latest failed restore invalidates old pass','checksum mismatch blocked','archive label mismatch blocked','new backup requires new verification and restore']) as data;
rollback;