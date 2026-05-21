-- CleanTrack Mobile: GPS-Stempeluhr / Objektprüfung
-- Einmal in Supabase im SQL Editor ausführen.

alter table public.work_sites
add column if not exists latitude double precision;

alter table public.work_sites
add column if not exists longitude double precision;

alter table public.work_sites
add column if not exists gps_required boolean not null default false;

alter table public.work_sites
add column if not exists allowed_radius_m integer not null default 150;

create index if not exists work_sites_gps_idx
on public.work_sites (latitude, longitude)
where latitude is not null and longitude is not null;

-- Diese Spalten gibt es bei dir bereits. Die Befehle sind nur zur Sicherheit hier dokumentiert.
-- time_entries.latitude       = Standort des Mitarbeiters beim Stempeln
-- time_entries.longitude      = Standort des Mitarbeiters beim Stempeln
-- time_entries.distance_m     = Abstand zum Objekt in Metern
-- time_entries.allowed_radius_m = erlaubter Radius des Objekts
-- time_entries.success        = true/false für erfolgreiche oder blockierte Stempelung
-- time_entries.error_message  = Grund, falls blockiert
