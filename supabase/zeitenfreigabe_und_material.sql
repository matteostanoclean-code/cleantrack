-- Zusatzspalten für die Zeitenfreigabe.
--
-- Einmal in Supabase ausführen (SQL Editor → Run). Das Skript legt nur an,
-- was fehlt, und ändert oder löscht nichts Bestehendes.
--
-- Stand der Prüfung vom 10.08.2026: alles Wichtige ist schon vorhanden
-- (approval_status, approved_minutes, approved_at, approved_by, admin_response,
-- planned_minutes, actual_minutes, overtime_minutes, pause_minutes,
-- corrected_at, corrected_by, correction_reason, material_products.image_url).
--
-- Ohne dieses Skript läuft die Zeitenfreigabe vollständig, nur zwei Angaben
-- werden dann nicht dauerhaft gespeichert: die Fahrzeit und die exakt
-- korrigierten Von-/Bis-Uhrzeiten. Die freigegebenen Minuten stimmen trotzdem.

alter table public.time_entries
  add column if not exists travel_minutes integer,
  add column if not exists corrected_start_time text,
  add column if not exists corrected_end_time text;

-- Schnellerer Zugriff auf den geprüften Zeitraum
create index if not exists time_entries_created_at_idx on public.time_entries (created_at desc);
create index if not exists time_entries_task_idx on public.time_entries (task_id);
