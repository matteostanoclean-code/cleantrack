-- CleanTrack: Mitarbeiter-Einladung und Profile
-- In Supabase SQL Editor ausführen, falls die Tabellen noch fehlen.

create extension if not exists pgcrypto;

create table if not exists public.employee_invites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  token text not null unique,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.employee_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  role text not null default 'employee',
  active boolean not null default true,
  must_change_password boolean not null default false,
  employee_number text,
  address text,
  street text,
  hourly_rate numeric default 0,
  employer_cost_factor numeric default 1,
  vacation_days numeric default 0,
  annual_vacation_days numeric default 0,
  avatar_url text,
  last_active timestamptz,
  created_at timestamptz not null default now()
);

alter table public.employee_invites enable row level security;
alter table public.employee_profiles enable row level security;

-- Eigene Profile lesen
create policy if not exists "employee_profiles_read_own"
on public.employee_profiles
for select
to authenticated
using (auth_user_id = auth.uid());

-- Admin darf Profile lesen
create policy if not exists "employee_profiles_admin_read"
on public.employee_profiles
for select
to authenticated
using (
  exists (
    select 1 from public.employee_profiles p
    where p.auth_user_id = auth.uid()
    and p.role = 'admin'
  )
);
