-- Enable useful extensions ----------------------------------------------------
create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- Waitlist requests -----------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'waitlist_status'
      and n.nspname = 'public'
  ) then
    create type public.waitlist_status as enum ('requested', 'contacted', 'invited', 'activated', 'archived');
  end if;
end
$$;

create table if not exists public.waitlist_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  email citext not null unique,
  company text,
  use_case text,
  status public.waitlist_status not null default 'requested',
  notes text,
  priority integer,
  last_contacted_at timestamptz,
  supabase_user_id uuid references auth.users (id) on delete set null,
  activation_sent_at timestamptz,
  activation_link text,
  activated_at timestamptz,
  metadata jsonb
);

alter table public.waitlist_requests
  add column if not exists company text,
  add column if not exists use_case text,
  add column if not exists status public.waitlist_status not null default 'requested',
  add column if not exists notes text,
  add column if not exists priority integer,
  add column if not exists last_contacted_at timestamptz,
  add column if not exists supabase_user_id uuid references auth.users (id) on delete set null,
  add column if not exists activation_sent_at timestamptz,
  add column if not exists activation_link text,
  add column if not exists activated_at timestamptz,
  add column if not exists metadata jsonb;

create index if not exists waitlist_requests_created_at_idx
  on public.waitlist_requests (created_at desc);

create index if not exists waitlist_requests_status_idx
  on public.waitlist_requests (status);

create index if not exists waitlist_requests_user_idx
  on public.waitlist_requests (supabase_user_id)
  where supabase_user_id is not null;

-- Security policies -----------------------------------------------------------
alter table public.waitlist_requests enable row level security;

drop policy if exists "allow service role access to waitlist requests" on public.waitlist_requests;
create policy "allow service role access to waitlist requests"
  on public.waitlist_requests
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Waitlist activation trigger -------------------------------------------------
create or replace function public.handle_waitlist_activation()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  waitlist_entry public.waitlist_requests%rowtype;
  merged_roles jsonb;
  app_meta jsonb;
  user_meta jsonb;
  now_utc timestamptz := timezone('utc', now());
begin
  if TG_OP = 'UPDATE' and (OLD.email_confirmed_at is not distinct from NEW.email_confirmed_at) then
    return NEW;
  end if;

  if NEW.email_confirmed_at is null then
    return NEW;
  end if;

  select *
    into waitlist_entry
    from public.waitlist_requests
   where email = NEW.email::citext
     and status = 'invited'
   limit 1;

  if not found then
    return NEW;
  end if;

  update public.waitlist_requests
     set status = 'activated',
         supabase_user_id = NEW.id,
         activated_at = coalesce(activated_at, now_utc),
         last_contacted_at = coalesce(last_contacted_at, now_utc),
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
           'activated_via',
           'auth_trigger',
           'activated_at',
           now_utc
         )
   where id = waitlist_entry.id;

  app_meta := coalesce(NEW.raw_app_meta_data, '{}'::jsonb);

  merged_roles := (
    select coalesce(jsonb_agg(role order by role), jsonb_build_array('beta_user', 'member'))
    from (
      select distinct role
      from (
        select jsonb_array_elements_text(coalesce(app_meta->'roles', '[]'::jsonb)) as role
        union all
        select 'member'
        union all
        select 'beta_user'
      ) roles
    ) distinct_roles
  );

  app_meta := jsonb_set(app_meta, '{roles}', merged_roles, true);
  app_meta := jsonb_set(app_meta, '{waitlist_request_id}', to_jsonb(waitlist_entry.id::text), true);
  NEW.raw_app_meta_data := app_meta;

  user_meta := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);

  if waitlist_entry.company is not null then
    user_meta := jsonb_set(user_meta, '{company}', to_jsonb(waitlist_entry.company), true);
  end if;

  if waitlist_entry.use_case is not null then
    user_meta := jsonb_set(user_meta, '{use_case}', to_jsonb(waitlist_entry.use_case), true);
  end if;

  NEW.raw_user_meta_data := user_meta;

  return NEW;
end;
$$;

drop trigger if exists promote_invited_waitlist_user on auth.users;
create trigger promote_invited_waitlist_user
before insert or update of email_confirmed_at on auth.users
for each row
when (NEW.email_confirmed_at is not null)
execute function public.handle_waitlist_activation();

-- CVM orchestration -----------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'cvm_instance_state'
      and n.nspname = 'public'
  ) then
    create type public.cvm_instance_state as enum ('provisioning', 'ready', 'degraded', 'retired');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'model_backend_mode'
      and n.nspname = 'public'
  ) then
    create type public.model_backend_mode as enum ('local', 'remote', 'hybrid');
  end if;
end
$$;

create table if not exists public.cvm_instances (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  slug text not null unique,
  base_url text not null unique,
  state public.cvm_instance_state not null default 'provisioning',
  provider text not null default 'phala',
  attestation_policy jsonb not null default '{}'::jsonb,
  endpoint_metadata jsonb,
  last_heartbeat_at timestamptz,
  retired_at timestamptz
);

create table if not exists public.user_cvm_assignments (
  user_id uuid primary key references auth.users (id) on delete cascade,
  cvm_instance_id uuid not null references public.cvm_instances (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (cvm_instance_id)
);

-- Legacy session-token table cleanup.
drop policy if exists "allow service role access to cvm session tokens" on public.cvm_session_tokens;
drop policy if exists "allow users to read own non-revoked cvm session tokens" on public.cvm_session_tokens;
drop table if exists public.cvm_session_tokens;

create table if not exists public.user_model_backends (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  mode public.model_backend_mode not null default 'local',
  remote_provider text,
  remote_model text,
  remote_base_url text,
  enabled boolean not null default false,
  metadata jsonb
);

create table if not exists public.user_passkeys (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  user_id uuid not null references auth.users (id) on delete cascade,
  credential_id_b64url text not null,
  public_key_cose_b64url text not null,
  user_handle_hash text,
  metadata jsonb,
  unique (credential_id_b64url)
);

create index if not exists cvm_instances_state_idx
  on public.cvm_instances (state);

create index if not exists cvm_instances_last_heartbeat_idx
  on public.cvm_instances (last_heartbeat_at desc);

alter table public.cvm_instances enable row level security;
alter table public.user_cvm_assignments enable row level security;
alter table public.user_model_backends enable row level security;
alter table public.user_passkeys enable row level security;

drop policy if exists "allow service role access to cvm instances" on public.cvm_instances;
create policy "allow service role access to cvm instances"
  on public.cvm_instances
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "allow users to read assigned cvm" on public.cvm_instances;
create policy "allow users to read assigned cvm"
  on public.cvm_instances
  for select
  using (
    exists (
      select 1
      from public.user_cvm_assignments assignments
      where assignments.cvm_instance_id = cvm_instances.id
        and assignments.user_id = auth.uid()
    )
  );

drop policy if exists "allow service role access to cvm assignments" on public.user_cvm_assignments;
create policy "allow service role access to cvm assignments"
  on public.user_cvm_assignments
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "allow users to read own cvm assignment" on public.user_cvm_assignments;
create policy "allow users to read own cvm assignment"
  on public.user_cvm_assignments
  for select
  using (user_id = auth.uid());

drop policy if exists "allow service role access to user model backends" on public.user_model_backends;
create policy "allow service role access to user model backends"
  on public.user_model_backends
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "allow users to read own model backend policy" on public.user_model_backends;
create policy "allow users to read own model backend policy"
  on public.user_model_backends
  for select
  using (user_id = auth.uid());

drop policy if exists "allow service role access to user passkeys" on public.user_passkeys;
create policy "allow service role access to user passkeys"
  on public.user_passkeys
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "allow users to read own passkeys" on public.user_passkeys;
create policy "allow users to read own passkeys"
  on public.user_passkeys
  for select
  using (user_id = auth.uid());
