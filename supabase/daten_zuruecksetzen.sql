-- ============================================================
-- Daten zurücksetzen: Einsätze, Zeiten und Mitarbeiter löschen
-- ============================================================
--
-- ACHTUNG: Das löscht echte Daten. Bitte Abschnitt für Abschnitt ausführen
-- und zwischendurch die von Supabase gemeldete Zeilenzahl anschauen.
--
-- WICHTIG: Abschnitt 1 legt zuerst Sicherungskopien an. Solange die
-- Kopien existieren, kannst du jederzeit zurück (Abschnitt 4).
--
-- WICHTIG: Dein eigenes Admin-Profil bleibt stehen. Ohne Profil kommst du
-- nicht mehr in die App. Prüfe vorher mit Abschnitt 0, dass dein Konto
-- wirklich als "admin" markiert ist.


-- ------------------------------------------------------------
-- Abschnitt 0: Vorher anschauen (löscht nichts)
-- ------------------------------------------------------------
select name, email, role, active, auth_user_id
from public.employee_profiles
order by role, name;

-- Erwartung: Deine eigene Zeile hat role = 'admin'.
-- Falls nicht, vorher setzen:
--   update public.employee_profiles set role = 'admin' where email = 'deine@mail.de';


-- ------------------------------------------------------------
-- Abschnitt 1: Sicherungskopien anlegen
-- ------------------------------------------------------------
create table if not exists backup_tasks           as select * from public.tasks;
create table if not exists backup_time_entries    as select * from public.time_entries;
create table if not exists backup_employees       as select * from public.employee_profiles;
create table if not exists backup_quality_reports as select * from public.quality_reports;
create table if not exists backup_service_reports as select * from public.service_reports;
create table if not exists backup_material_reports as select * from public.material_reports;
create table if not exists backup_absences        as select * from public.absence_requests;

select
  (select count(*) from backup_tasks)        as einsaetze_gesichert,
  (select count(*) from backup_time_entries) as zeiten_gesichert,
  (select count(*) from backup_employees)    as mitarbeiter_gesichert;


-- ------------------------------------------------------------
-- Abschnitt 2: Löschen, in dieser Reihenfolge
-- ------------------------------------------------------------
-- Zuerst alles, was an Einsätzen und Mitarbeitern hängt.
delete from public.time_entries;
delete from public.quality_reports;
delete from public.service_reports;
delete from public.material_reports;
delete from public.absence_requests;
delete from public.admin_notifications;
delete from public.chat_messages;
delete from public.employee_work_sites;

-- Dann die Einsätze selbst.
delete from public.tasks;

-- Zuletzt die Mitarbeiter — außer Admins, sonst sperrst du dich aus.
delete from public.employee_profiles
where coalesce(lower(role), '') <> 'admin';


-- ------------------------------------------------------------
-- Abschnitt 3: Ergebnis prüfen
-- ------------------------------------------------------------
select
  (select count(*) from public.tasks)             as einsaetze,
  (select count(*) from public.time_entries)      as zeiten,
  (select count(*) from public.employee_profiles) as mitarbeiter_uebrig,
  (select count(*) from public.work_sites)        as objekte_unberuehrt;

-- Erwartung: einsaetze = 0, zeiten = 0, mitarbeiter_uebrig = Anzahl deiner
-- Admin-Konten, objekte_unberuehrt = 38 (Objekte und Kunden bleiben!).


-- ------------------------------------------------------------
-- Abschnitt 4: Nur im Notfall — alles zurückholen
-- ------------------------------------------------------------
-- insert into public.employee_profiles select * from backup_employees
--   on conflict (id) do nothing;
-- insert into public.tasks            select * from backup_tasks            on conflict (id) do nothing;
-- insert into public.time_entries     select * from backup_time_entries     on conflict (id) do nothing;
-- insert into public.quality_reports  select * from backup_quality_reports  on conflict (id) do nothing;
-- insert into public.service_reports  select * from backup_service_reports  on conflict (id) do nothing;
-- insert into public.material_reports select * from backup_material_reports on conflict (id) do nothing;
-- insert into public.absence_requests select * from backup_absences         on conflict (id) do nothing;


-- ------------------------------------------------------------
-- Abschnitt 5: Aufräumen, wenn alles passt (frühestens in ein paar Tagen)
-- ------------------------------------------------------------
-- drop table if exists backup_tasks, backup_time_entries, backup_employees,
--   backup_quality_reports, backup_service_reports, backup_material_reports,
--   backup_absences;
