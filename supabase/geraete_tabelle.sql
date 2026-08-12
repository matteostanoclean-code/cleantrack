-- ============================================================
-- Geräte- und Inventarverwaltung: Tabelle anlegen
-- ============================================================
--
-- Ohne diese Tabelle zeigt die Geräteseite einen Hinweis und tut sonst nichts.
-- Nach dem Ausführen funktioniert sie sofort, ohne weiteres Zutun.

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  device_type text,
  work_site_id uuid,
  work_site_name text,
  serial_number text,
  inventory_number text,
  description text,
  purchase_date date,
  last_service_date date,
  service_interval_months integer,
  status text not null default 'aktiv',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- Schneller Zugriff auf die Geräte eines Objekts
create index if not exists devices_work_site_idx on public.devices (work_site_id);
create index if not exists devices_status_idx on public.devices (status);

-- Die App greift ausschließlich über den Service-Key zu, deshalb bleibt die
-- Tabelle für anonyme Zugriffe gesperrt.
alter table public.devices enable row level security;

-- Kontrolle
select count(*) as geraete from public.devices;
