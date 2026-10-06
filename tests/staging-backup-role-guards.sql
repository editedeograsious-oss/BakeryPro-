begin;
do $guard$ begin if (select environment_mode from public.system_environment_config where id=1)<>'staging' then raise exception 'This regression test requires staging';end if;end $guard$;
select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{"role":"authenticated"}',true);
set local role authenticated;
do $test$ begin
 begin perform public.backup_recovery_status();raise exception 'Missing staff role read backup evidence';
 exception when others then if sqlerrm<>'Owner or manager access required' then raise;end if;end;
 begin perform public.recovery_verification_manifest();raise exception 'Missing staff role read recovery manifest';
 exception when others then if sqlerrm<>'Owner or manager access required' then raise;end if;end;
 begin perform public.record_backup_recovery_event('plan_prepared','pass','ROLLBACK ONLY',null,'ROLLBACK ONLY');raise exception 'Missing staff role recorded recovery evidence';
 exception when others then if sqlerrm<>'Only owner may record backup/recovery evidence' then raise;end if;end;
end $test$;
select set_config('request.jwt.claim.sub','8611576b-7a6f-4c6c-8556-2846f10a2cfc',true);
do $test$ begin
 perform public.backup_recovery_status();
 perform public.recovery_verification_manifest();
 begin perform public.record_backup_recovery_event('plan_prepared','pass','ROLLBACK ONLY',null,'ROLLBACK ONLY');raise exception 'Manager recorded Owner evidence';
 exception when others then if sqlerrm<>'Only owner may record backup/recovery evidence' then raise;end if;end;
end $test$;
select set_config('request.jwt.claim.sub','b2931c2c-243c-40a6-9c40-6a156d54d1dc',true);
do $test$ begin
 begin perform public.backup_recovery_status();raise exception 'Cashier read backup evidence';
 exception when others then if sqlerrm<>'Owner or manager access required' then raise;end if;end;
end $test$;
select jsonb_build_object('result','PASS','checks',array['unregistered staff denied','Manager read allowed','Owner-only evidence writes','Cashier read denied']) as data;
rollback;