-- ============================================================
-- Mitarbeiterakte: fehlende Felder ergänzen
-- Stand 28.08.2026
-- ============================================================
--
-- Die Mitarbeiterseite fragt deutlich mehr ab als bisher in der Tabelle
-- stand: Vor- und Nachname getrennt, vollständige Anschrift, Vertragsdaten,
-- Wochenstunden je Wochentag, Urlaubsanspruch und Fortzahlung.
--
-- Ohne diese Spalten läuft die Seite trotzdem — was nicht gespeichert werden
-- kann, wird beim Sichern übersprungen und die Felder bleiben leer. Erst nach
-- diesem Skript bleibt alles stehen.
--
-- Einmal im SQL-Editor von Supabase ausführen. Läuft auch mehrfach ohne
-- Schaden.

alter table public.employee_profiles
  -- Person
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists gender text,
  add column if not exists language text,

  -- Anschrift. street und address gibt es schon.
  add column if not exists postal_code text,
  add column if not exists city text,
  add column if not exists country text,
  add column if not exists address_addition text,

  -- Vertrag
  add column if not exists employment_type text,
  add column if not exists employee_group text,
  add column if not exists contract_start date,
  add column if not exists contract_end date,
  add column if not exists wage_type text,
  add column if not exists weekly_hours numeric,
  add column if not exists hours_monday numeric,
  add column if not exists hours_tuesday numeric,
  add column if not exists hours_wednesday numeric,
  add column if not exists hours_thursday numeric,
  add column if not exists hours_friday numeric,
  add column if not exists hours_saturday numeric,
  add column if not exists hours_sunday numeric,
  add column if not exists travel_time_allowed boolean default false,
  add column if not exists absence_pay_per_day numeric,

  -- Konto
  add column if not exists rights_group text,
  add column if not exists tags text,
  add column if not exists notes text,
  add column if not exists status text;

comment on column public.employee_profiles.weekly_hours is
  'Vereinbarte Wochenstunden. Grundlage für die Urlaubstage-Rechnung.';
comment on column public.employee_profiles.absence_pay_per_day is
  'Stunden, die bei einer Abwesenheit je Tag fortgezahlt werden. Leer heisst: aus dem Wochentagsmuster rechnen.';
comment on column public.employee_profiles.travel_time_allowed is
  'Darf in der App Fahrzeit erfassen.';

-- Vor- und Nachname aus dem vorhandenen Namen vorbelegen, damit die Felder
-- nicht leer starten. Nur wo noch nichts steht.
update public.employee_profiles
set first_name = split_part(name, ' ', 1)
where coalesce(first_name, '') = '' and coalesce(name, '') <> '';

update public.employee_profiles
set last_name = nullif(trim(substr(name, length(split_part(name, ' ', 1)) + 1)), '')
where coalesce(last_name, '') = '' and coalesce(name, '') <> '';

-- Kontrolle: sollte die neuen Spalten zeigen.
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'employee_profiles'
  and column_name in (
    'first_name','last_name','gender','language','postal_code','city','country',
    'address_addition','employment_type','employee_group','contract_start','contract_end',
    'wage_type','weekly_hours','hours_monday','travel_time_allowed','absence_pay_per_day',
    'rights_group','tags','notes','status'
  )
order by column_name;
