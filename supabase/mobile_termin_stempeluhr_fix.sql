-- CleanTrack Mobile Fix: Termine sichtbar machen + Stempeluhr an Termin koppeln
-- In Supabase ausführen: SQL Editor → New Query → Run

-- 1) Zeitbuchungen können dem konkreten Einsatz/Termin zugeordnet werden.
alter table public.time_entries
add column if not exists task_id uuid references public.tasks(id) on delete set null;

create index if not exists idx_time_entries_task_id
on public.time_entries(task_id);

create index if not exists idx_time_entries_employee_created_at
on public.time_entries(employee_name, created_at desc);

create index if not exists idx_tasks_employee_date
on public.tasks(employee_name, task_date, start_time);

-- 2) Stempeluhr-Aktionen erlauben.
alter table public.time_entries
drop constraint if exists time_entries_action_check;

alter table public.time_entries
add constraint time_entries_action_check
check (
  action is null
  or action in (
    'clock_in',
    'clock_out',
    'break_start',
    'break_end',
    'start',
    'end',
    'pause_start',
    'pause_end',
    'check_in',
    'check_out',
    'absence',
    'manual',
    'auto_clock_out'
  )
);

-- 3) Optional, aber hilfreich: fehlende Objekt-/GPS-Felder sauber vorbereiten.
alter table public.work_sites add column if not exists latitude double precision;
alter table public.work_sites add column if not exists longitude double precision;
alter table public.work_sites add column if not exists allowed_radius_m integer default 150;
alter table public.work_sites add column if not exists gps_required boolean default false;

-- 4) Neue Einsätze sollen Mitarbeiter informieren können.
alter table public.tasks add column if not exists notify_employee boolean default true;
