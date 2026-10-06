-- Existing staging test records only; this test rolls back every mutation.
begin;
do $guard$ begin if (select environment_mode from public.system_environment_config where id=1)<>'staging' then raise exception 'This test requires the staging project';end if;end $guard$;
select set_config('request.jwt.claim.sub','e66ef29d-a4e0-4529-ac2d-f719714c1688',true),set_config('request.jwt.claims','{"sub":"e66ef29d-a4e0-4529-ac2d-f719714c1688","role":"authenticated"}',true);
set local role authenticated;
do $test$ begin
 begin perform public.void_expense('e638ccb6-4442-4a3c-bc32-fa4215ea5fcc','ROLLBACK ONLY');set constraints all immediate;raise exception 'Independent salary void was allowed';
 exception when check_violation then null;end;
 begin perform public.edit_expense('e638ccb6-4442-4a3c-bc32-fa4215ea5fcc','Payroll','ROLLBACK ONLY',1,'bank','STAGING-PAYROLL-NOV-002',null,'ROLLBACK ONLY');set constraints all immediate;raise exception 'Mismatched salary amount was allowed';
 exception when check_violation then null;end;
 begin perform public.restore_expense('533e7285-64cd-4ca5-b17e-8c64cb74be78','ROLLBACK ONLY');set constraints all immediate;raise exception 'Replaced expense was restored';
 exception when check_violation then null;end;
 begin perform public.reverse_payroll_payment('2b1a58cc-f9ea-4377-928d-10c539ee6c2b','ROLLBACK ONLY');raise exception 'Legacy advance history was assumed';
 exception when others then if sqlerrm not like 'Salary advance allocation history is missing%' then raise;end if;end;
end $test$;
select jsonb_build_object('test','expense_consistency_and_missing_advance_history','result','PASS') as data;
rollback;