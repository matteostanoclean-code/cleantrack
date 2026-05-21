-- Optional: eigene Tabelle für Qualitätsnachweise aus der Mitarbeiter-App.
-- Die App funktioniert auch ohne diese Tabelle und schreibt dann zusätzlich in admin_notifications.
create table if not exists public.quality_reports (
  id uuid primary key default gen_random_uuid(),
  task_id uuid null,
  employee_profile_id uuid null,
  employee_name text not null,
  work_site_id uuid null,
  work_site_name text null,
  checked_items jsonb not null default '[]'::jsonb,
  notes text null,
  status text not null default 'submitted',
  created_at timestamp with time zone not null default now()
);

create index if not exists quality_reports_employee_name_idx on public.quality_reports(employee_name);
create index if not exists quality_reports_task_id_idx on public.quality_reports(task_id);
create index if not exists quality_reports_created_at_idx on public.quality_reports(created_at desc);
