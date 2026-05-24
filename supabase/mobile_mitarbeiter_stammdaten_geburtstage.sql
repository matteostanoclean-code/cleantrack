-- CleanTrack Mobile: Mitarbeiter-Stammdaten erweitern
-- Fügt Stundensatz, Urlaubsanspruch und Geburtstag sicher hinzu.

alter table public.employee_profiles
  add column if not exists hourly_rate numeric;

alter table public.employee_profiles
  add column if not exists annual_vacation_days numeric;

alter table public.employee_profiles
  add column if not exists vacation_days numeric;

alter table public.employee_profiles
  add column if not exists birthday date;

comment on column public.employee_profiles.hourly_rate is 'Interner Stundensatz / Lohnsatz des Mitarbeiters.';
comment on column public.employee_profiles.annual_vacation_days is 'Urlaubsanspruch pro Jahr in Tagen.';
comment on column public.employee_profiles.vacation_days is 'Kompatibilitätsfeld für Urlaubsanspruch.';
comment on column public.employee_profiles.birthday is 'Geburtstag des Mitarbeiters. Jahr kann eingetragen werden, Auswertung nutzt Tag und Monat.';

create index if not exists employee_profiles_birthday_idx
  on public.employee_profiles (birthday);

create index if not exists admin_notifications_birthday_idx
  on public.admin_notifications (notification_type, employee_name, created_at);
