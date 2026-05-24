-- Leistungsnachweis mit Kundenunterschrift für CleanTrack Mobile

create table if not exists public.service_reports (
  id uuid primary key default gen_random_uuid(),
  task_id uuid null,
  employee_profile_id uuid null,
  employee_name text null,
  work_site_id uuid null,
  work_site_name text null,
  customer_name text null,
  signer_name text null,
  signature_url text null,
  notes text null,
  status text not null default 'signed',
  created_at timestamp with time zone not null default now()
);

alter table public.service_reports
  add column if not exists task_id uuid null,
  add column if not exists employee_profile_id uuid null,
  add column if not exists employee_name text null,
  add column if not exists work_site_id uuid null,
  add column if not exists work_site_name text null,
  add column if not exists customer_name text null,
  add column if not exists signer_name text null,
  add column if not exists signature_url text null,
  add column if not exists notes text null,
  add column if not exists status text not null default 'signed',
  add column if not exists created_at timestamp with time zone not null default now();

create index if not exists service_reports_employee_created_idx
  on public.service_reports (employee_name, created_at desc);

create index if not exists service_reports_task_idx
  on public.service_reports (task_id);

create index if not exists service_reports_status_idx
  on public.service_reports (status);

-- Storage Bucket wird zusätzlich beim ersten Senden automatisch angelegt.
-- Falls Storage-RLS aktiv ist, bleibt die Speicherung über den Server-Service-Key möglich.
