-- ============================================================
-- Noch offen, Stand 01.11.2026 abends
-- ============================================================
--
-- Zwei Dinge auf einmal, und oben eine Gegenprobe. Dreimal ist dieselbe
-- Aenderung jetzt nicht angekommen, obwohl der Editor "fertig" gemeldet
-- hat -- das sieht danach aus, dass sie in einer anderen Datenbank gelandet
-- ist. Der erste Block sagt, in welcher sie laeuft.
--
-- Im SQL-Editor einfuegen und auf Run. Laeuft auch mehrfach ohne Schaden.


-- ------------------------------------------------------------
-- 0. Wo laeuft das hier? Diese Zahlen muessen stimmen:
--      einsaetze 1329, kunden 26, objekte 31
--    Stehen dort andere Zahlen, ist der Editor auf dem falschen Projekt.
--    Richtig ist abdoaiwtvbrvotnapcxo (steht in der Adresszeile).
-- ------------------------------------------------------------
select current_database()                      as datenbank,
       (select count(*) from public.tasks)      as einsaetze,
       (select count(*) from public.customers)  as kunden,
       (select count(*) from public.work_sites) as objekte;


-- ------------------------------------------------------------
-- 1. Kundenantworten werden Vorschlag, nicht Eintrag
-- ------------------------------------------------------------
-- bestaetigt = false heisst: aus einer Kundenmail gelesen, der Planer
-- sieht es nicht an, bis jemand im Urlaubsplaner zustimmt. Vorgabe ist
-- true, damit alles von Hand Eingetragene unveraendert weiterlaeuft.

alter table public.site_closures
  add column if not exists bestaetigt boolean not null default true,
  add column if not exists quelle     text,
  add column if not exists absender   text,
  add column if not exists zitat      text,
  add column if not exists erkannt_at timestamptz;

create index if not exists site_closures_offen_idx
  on public.site_closures (bestaetigt)
  where bestaetigt = false;


-- ------------------------------------------------------------
-- 2. Entgeltabrechnungen in der App
-- ------------------------------------------------------------
-- Haelt nur den Verweis auf die Datei und zu wem sie gehoert. Keine
-- Betraege. Die Datei selbst liegt in einem privaten Ablagefach, und eine
-- Adresse dorthin erzeugt der Server nur fuer fuenf Minuten.

create table if not exists public.lohn_dokumente (
  id                  uuid primary key default gen_random_uuid(),
  employee_profile_id uuid not null,
  employee_name       text,
  jahr                integer not null,
  monat               integer not null,
  art                 text not null default 'entgeltabrechnung',
  pfad                text not null,
  dateiname           text,
  groesse             integer,
  personalnummer      text,
  hochgeladen_at      timestamptz not null default now(),
  hochgeladen_von     text,
  gesehen_at          timestamptz
);

create unique index if not exists lohn_dokumente_eindeutig_idx
  on public.lohn_dokumente (employee_profile_id, jahr, monat, art);

create index if not exists lohn_dokumente_person_idx
  on public.lohn_dokumente (employee_profile_id, jahr desc, monat desc);

-- Lesen und schreiben darf hier ausschliesslich der Server.
alter table public.lohn_dokumente enable row level security;


-- ------------------------------------------------------------
-- 3. Kontrolle. Beide Zeilen muessen "da" sagen.
-- ------------------------------------------------------------
select 'Kundenantworten' as was,
       case when exists (select 1 from information_schema.columns
                         where table_schema = 'public'
                           and table_name = 'site_closures'
                           and column_name = 'bestaetigt')
            then 'da' else 'fehlt' end as stand
union all
select 'Abrechnungen in der App',
       case when exists (select 1 from information_schema.tables
                         where table_schema = 'public'
                           and table_name = 'lohn_dokumente')
            then 'da' else 'fehlt' end;
