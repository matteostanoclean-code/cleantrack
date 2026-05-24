-- CleanTrack Mobile: Stempeluhr + Tagesplan Fix
-- In Supabase ausführen: SQL Editor -> New Query -> Run

-- Konkrete Zeitbuchungen dem Termin zuordnen.
alter table public.time_entries
add column if not exists task_id uuid references public.tasks(id) on delete set null;

create index if not exists idx_time_entries_task_id
on public.time_entries(task_id);

create index if not exists idx_time_entries_employee_created_at
on public.time_entries(employee_name, created_at desc);

create index if not exists idx_tasks_employee_date
on public.tasks(employee_name, task_date, start_time);

-- GPS-Felder am Objekt sicherstellen.
alter table public.work_sites add column if not exists latitude double precision;
alter table public.work_sites add column if not exists longitude double precision;
alter table public.work_sites add column if not exists allowed_radius_m integer default 150;
alter table public.work_sites add column if not exists gps_required boolean default true;

-- Stempel-Aktionen erlauben.
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

-- Alte fehlgeschlagene GPS-Versuche aus der Stempeluhr entfernen,
-- damit sie nicht mehr als aktive Arbeitszeit interpretiert werden.
delete from public.time_entries
where success = false
and action in ('clock_in', 'break_start', 'break_end', 'clock_out');
