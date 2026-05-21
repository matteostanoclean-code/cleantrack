-- Qualitätsnachweise mit Foto-Upload.
-- Diese Datei einmal in Supabase im SQL Editor ausführen.

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

alter table public.quality_reports
  add column if not exists photo_urls jsonb not null default '[]'::jsonb,
  add column if not exists photo_count integer not null default 0;

create index if not exists quality_reports_employee_name_idx on public.quality_reports(employee_name);
create index if not exists quality_reports_task_id_idx on public.quality_reports(task_id);
create index if not exists quality_reports_created_at_idx on public.quality_reports(created_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'quality-photos',
  'quality-photos',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
