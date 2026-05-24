create extension if not exists pgcrypto;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  employee_profile_id uuid null references public.employee_profiles(id) on delete set null,
  employee_name text null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  subscription_json jsonb null,
  user_agent text null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_employee_profile_id_idx
  on public.push_subscriptions(employee_profile_id);

create index if not exists push_subscriptions_employee_name_idx
  on public.push_subscriptions(employee_name);

create index if not exists push_subscriptions_active_idx
  on public.push_subscriptions(active);
