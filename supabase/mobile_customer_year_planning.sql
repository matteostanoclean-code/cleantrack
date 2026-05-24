-- CleanTrack: Kunden-Jahresplanung und spätere Serien-Zuweisung

alter table public.customers
add column if not exists work_days text[];

alter table public.customers
add column if not exists default_start_time text;

alter table public.customers
add column if not exists default_end_time text;

alter table public.customers
add column if not exists planning_limit_minutes_per_day numeric;

alter table public.customers
add column if not exists default_task_title text;

alter table public.customers
add column if not exists default_work_site_id uuid;

create index if not exists tasks_recurrence_group_id_idx
on public.tasks (recurrence_group_id);

create index if not exists tasks_customer_employee_date_idx
on public.tasks (customer_id, employee_name, task_date);
