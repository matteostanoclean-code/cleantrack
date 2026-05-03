-- CleanTrack Admin Module Tabellen
-- In Supabase SQL Editor ausführen, falls beim Arbeiten im Adminbereich Tabellen oder Spalten fehlen.

create extension if not exists pgcrypto;

create table if not exists public.work_sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  active boolean not null default true,
  latitude numeric,
  longitude numeric,
  allowed_radius_m numeric default 50,
  notes text,
  customer_name text,
  customer_number text,
  customer_address text,
  customer_phone text,
  customer_email text,
  customer_notes text,
  created_at timestamptz not null default now()
);

alter table public.work_sites add column if not exists active boolean not null default true;
alter table public.work_sites add column if not exists latitude numeric;
alter table public.work_sites add column if not exists longitude numeric;
alter table public.work_sites add column if not exists allowed_radius_m numeric default 50;
alter table public.work_sites add column if not exists notes text;
alter table public.work_sites add column if not exists customer_name text;
alter table public.work_sites add column if not exists customer_number text;
alter table public.work_sites add column if not exists customer_address text;
alter table public.work_sites add column if not exists customer_phone text;
alter table public.work_sites add column if not exists customer_email text;
alter table public.work_sites add column if not exists customer_notes text;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  task_date date,
  start_time text,
  end_time text,
  max_minutes numeric default 0,
  planned_minutes numeric default 0,
  employee_name text,
  site text,
  work_site_id uuid,
  priority text default 'Normal',
  notes text,
  done boolean not null default false,
  recurrence_group_id uuid,
  created_at timestamptz not null default now()
);

alter table public.tasks add column if not exists priority text default 'Normal';
alter table public.tasks add column if not exists notes text;
alter table public.tasks add column if not exists done boolean not null default false;
alter table public.tasks add column if not exists recurrence_group_id uuid;
alter table public.tasks add column if not exists work_site_id uuid;
alter table public.tasks add column if not exists planned_minutes numeric default 0;
alter table public.tasks add column if not exists max_minutes numeric default 0;

create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  employee_name text,
  site text,
  work_site_id uuid,
  task_id uuid,
  check_in_at timestamptz,
  check_out_at timestamptz,
  worked_minutes numeric default 0,
  planned_minutes numeric default 0,
  status text default 'open',
  approved boolean default false,
  created_at timestamptz not null default now()
);

create table if not exists public.absence_requests (
  id uuid primary key default gen_random_uuid(),
  employee_name text not null,
  absence_type text not null default 'Urlaub',
  start_date date not null,
  end_date date not null,
  reason text,
  status text default 'open',
  created_at timestamptz not null default now()
);

create table if not exists public.material_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  unit text default 'Stück',
  current_stock numeric default 0,
  min_stock numeric default 0,
  supplier text,
  image_url text,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.material_products add column if not exists supplier text;
alter table public.material_products add column if not exists image_url text;
alter table public.material_products add column if not exists notes text;

create table if not exists public.equipment_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  serial_number text,
  assigned_to text,
  status text default 'Aktiv',
  image_url text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.key_items (
  id uuid primary key default gen_random_uuid(),
  key_name text not null,
  key_number text,
  customer_name text,
  object_name text,
  employee_name text,
  status text default 'Ausgegeben',
  handover_date date,
  return_date date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text,
  phone text,
  email text,
  role text,
  contact_role text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  employee_name text not null,
  sender_role text not null default 'admin',
  sender_name text,
  message text not null,
  read_by_admin boolean default true,
  read_by_employee boolean default false,
  created_at timestamptz not null default now()
);

alter table public.work_sites enable row level security;
alter table public.tasks enable row level security;
alter table public.time_entries enable row level security;
alter table public.absence_requests enable row level security;
alter table public.material_products enable row level security;
alter table public.equipment_items enable row level security;
alter table public.key_items enable row level security;
alter table public.customer_contacts enable row level security;
alter table public.chat_messages enable row level security;

-- Die Admin-Oberfläche nutzt zusätzlich die Server-API mit SUPABASE_SERVICE_ROLE_KEY.
-- Diese Policies sind für Mitarbeiter-App-Lesezugriffe und einfache Auth-Zugriffe gedacht.
do $$
declare
  t text;
begin
  foreach t in array array['work_sites','tasks','time_entries','absence_requests','material_products','equipment_items','key_items','customer_contacts','chat_messages'] loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
      and tablename = t
      and policyname = t || '_admin_all'
    ) then
      execute format(
        'create policy %I on public.%I for all to authenticated using (exists (select 1 from public.employee_profiles p where p.auth_user_id = auth.uid() and p.role = ''admin'')) with check (exists (select 1 from public.employee_profiles p where p.auth_user_id = auth.uid() and p.role = ''admin''))',
        t || '_admin_all',
        t
      );
    end if;
  end loop;
end $$;
