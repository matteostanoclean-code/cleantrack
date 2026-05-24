create extension if not exists pgcrypto;

create table if not exists public.task_push_reminders (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  employee_name text not null,
  reminder_type text not null check (reminder_type in ('60min', '15min')),
  task_date date null,
  task_start_time text null,
  push_count integer not null default 0,
  failed_count integer not null default 0,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (task_id, reminder_type)
);

create index if not exists task_push_reminders_task_id_idx
  on public.task_push_reminders(task_id);

create index if not exists task_push_reminders_employee_name_idx
  on public.task_push_reminders(employee_name);

create index if not exists task_push_reminders_sent_at_idx
  on public.task_push_reminders(sent_at desc);
