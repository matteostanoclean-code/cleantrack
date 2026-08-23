-- ============================================================
-- Push-Anmeldungen: fehlende Spalte employee_profile_id ergänzen
-- ============================================================
--
-- Der Code schreibt und liest diese Spalte an mehreren Stellen, in der
-- Datenbank fehlt sie aber. Ergebnis: Die Push-Zentrale meldet
-- "column push_subscriptions.employee_profile_id does not exist" und zeigt
-- null aktive Mitarbeiter, obwohl welche vorhanden sind.
--
-- Einmal im SQL-Editor von Supabase ausführen. Läuft auch mehrfach ohne
-- Schaden.

alter table public.push_subscriptions
  add column if not exists employee_profile_id uuid;

-- Bestehende Anmeldungen anhand des Namens nachtragen, damit die vorhandenen
-- Geräte nicht neu angemeldet werden müssen.
update public.push_subscriptions as p
set employee_profile_id = e.id
from public.employee_profiles as e
where p.employee_profile_id is null
  and p.employee_name is not null
  and p.employee_name = e.name;

create index if not exists push_subscriptions_profile_idx
  on public.push_subscriptions (employee_profile_id);

-- Kontrolle: sollte 0 offene Zeilen zeigen, sofern alle Namen zugeordnet werden konnten.
-- select count(*) from public.push_subscriptions where employee_profile_id is null;
