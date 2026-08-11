drop policy if exists "authenticated_read_active_plans" on public.account_plans;
create policy "authenticated_read_active_plans"
  on public.account_plans
  for select
  to authenticated
  using (active);

grant select on public.account_plans to authenticated;

alter function public.get_export_access() security invoker;
revoke all on function public.get_export_access() from public, anon;
grant execute on function public.get_export_access() to authenticated;

create index if not exists export_events_user_id_idx
  on public.export_events (user_id);

create index if not exists user_profiles_plan_code_idx
  on public.user_profiles (plan_code);
