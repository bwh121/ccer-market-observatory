create table if not exists public.account_plans (
  plan_code text primary key,
  display_name text not null,
  daily_export_limit integer check (daily_export_limit is null or daily_export_limit >= 0),
  data_scope jsonb not null default '{}'::jsonb,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.account_plans (plan_code, display_name, daily_export_limit, data_scope, active)
values
  ('free', '免费用户', 2, '{"exports":"standard"}'::jsonb, true),
  ('pro', '专业用户', null, '{"exports":"reserved"}'::jsonb, false),
  ('institutional', '机构用户', null, '{"exports":"reserved"}'::jsonb, false)
on conflict (plan_code) do nothing;

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_code text not null default 'free' references public.account_plans(plan_code),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.user_profiles (user_id)
select id from auth.users
on conflict (user_id) do nothing;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_profile on auth.users;
create trigger on_auth_user_created_create_profile
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

alter table public.account_plans enable row level security;
alter table public.user_profiles enable row level security;

drop policy if exists "users_read_own_profile" on public.user_profiles;
create policy "users_read_own_profile"
  on public.user_profiles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.account_plans from anon, authenticated;
revoke all on public.user_profiles from anon;
grant select on public.user_profiles to authenticated;

alter table public.export_usage drop constraint if exists export_usage_used_count_check;
alter table public.export_usage
  add constraint export_usage_used_count_check check (used_count between 0 and 32767);

alter table public.export_events add column if not exists event_status text not null default 'authorized';
alter table public.export_events add column if not exists storage_bucket text;
alter table public.export_events add column if not exists storage_path text;
alter table public.export_events add column if not exists completed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'export_events_event_status_check'
      and conrelid = 'public.export_events'::regclass
  ) then
    alter table public.export_events
      add constraint export_events_event_status_check
      check (event_status in ('authorized', 'completed'));
  end if;
end;
$$;

create or replace function public.get_export_access()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_usage_date date := timezone('Asia/Shanghai', now())::date;
  current_plan_code text;
  current_plan_name text;
  current_daily_limit integer;
  current_used_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select plans.plan_code, plans.display_name, plans.daily_export_limit
    into current_plan_code, current_plan_name, current_daily_limit
    from public.user_profiles profiles
    join public.account_plans plans on plans.plan_code = profiles.plan_code
    where profiles.user_id = current_user_id and plans.active;

  if current_plan_code is null or current_daily_limit is null then
    select plan_code, display_name, daily_export_limit
      into current_plan_code, current_plan_name, current_daily_limit
      from public.account_plans
      where plan_code = 'free';
  end if;

  select coalesce(used_count, 0)
    into current_used_count
    from public.export_usage
    where user_id = current_user_id and usage_date = current_usage_date;

  return jsonb_build_object(
    'plan_code', current_plan_code,
    'plan_name', current_plan_name,
    'daily_limit', current_daily_limit,
    'used', coalesce(current_used_count, 0),
    'remaining', greatest(0, current_daily_limit - coalesce(current_used_count, 0))
  );
end;
$$;

create or replace function private.claim_export_quota(requested_kind text, requested_label text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_usage_date date := timezone('Asia/Shanghai', now())::date;
  current_plan_code text;
  current_plan_name text;
  current_daily_limit integer;
  current_used_count integer;
  current_event_id bigint;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if requested_kind not in ('image', 'data') then
    raise exception 'Unsupported export kind';
  end if;

  select plans.plan_code, plans.display_name, plans.daily_export_limit
    into current_plan_code, current_plan_name, current_daily_limit
    from public.user_profiles profiles
    join public.account_plans plans on plans.plan_code = profiles.plan_code
    where profiles.user_id = current_user_id and plans.active;

  if current_plan_code is null or current_daily_limit is null then
    select plan_code, display_name, daily_export_limit
      into current_plan_code, current_plan_name, current_daily_limit
      from public.account_plans
      where plan_code = 'free';
  end if;

  insert into public.export_usage as usage (user_id, usage_date, used_count, updated_at)
  values (current_user_id, current_usage_date, 1, now())
  on conflict (user_id, usage_date) do update
    set used_count = usage.used_count + 1,
        updated_at = now()
    where usage.used_count < current_daily_limit
  returning used_count into current_used_count;

  if current_used_count is null then
    select used_count
      into current_used_count
      from public.export_usage
      where user_id = current_user_id and usage_date = current_usage_date;

    return jsonb_build_object(
      'allowed', false,
      'plan_code', current_plan_code,
      'plan_name', current_plan_name,
      'daily_limit', current_daily_limit,
      'used', coalesce(current_used_count, current_daily_limit),
      'remaining', 0
    );
  end if;

  insert into public.export_events (user_id, usage_date, export_kind, export_label, event_status)
  values (current_user_id, current_usage_date, requested_kind, left(requested_label, 240), 'authorized')
  returning id into current_event_id;

  return jsonb_build_object(
    'allowed', true,
    'event_id', current_event_id,
    'plan_code', current_plan_code,
    'plan_name', current_plan_name,
    'daily_limit', current_daily_limit,
    'used', current_used_count,
    'remaining', greatest(0, current_daily_limit - current_used_count)
  );
end;
$$;

create or replace function public.claim_export_quota(requested_kind text, requested_label text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.claim_export_quota(requested_kind, requested_label);
$$;

create or replace function public.release_failed_export(requested_event_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_user_id uuid;
  event_usage_date date;
  current_status text;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select user_id, usage_date, event_status
    into event_user_id, event_usage_date, current_status
    from public.export_events
    where id = requested_event_id
    for update;

  if event_user_id is null or current_status <> 'authorized' then
    return false;
  end if;

  delete from public.export_events where id = requested_event_id;
  update public.export_usage
    set used_count = greatest(0, used_count - 1), updated_at = now()
    where user_id = event_user_id and usage_date = event_usage_date;
  return true;
end;
$$;

revoke all on function public.get_export_access() from public;
grant execute on function public.get_export_access() to authenticated;
revoke all on function private.claim_export_quota(text, text) from public;
grant usage on schema private to authenticated;
grant execute on function private.claim_export_quota(text, text) to authenticated;
revoke all on function public.claim_export_quota(text, text) from public;
grant execute on function public.claim_export_quota(text, text) to authenticated;
revoke all on function public.release_failed_export(bigint) from public, anon, authenticated;
grant execute on function public.release_failed_export(bigint) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ccer-private-exports',
  'ccer-private-exports',
  false,
  12582912,
  array['text/csv', 'text/csv;charset=utf-8', 'image/png']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "authenticated_read_private_exports" on storage.objects;
