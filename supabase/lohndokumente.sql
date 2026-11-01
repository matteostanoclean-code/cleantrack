-- Entgeltabrechnungen in der App.
--
-- Bisher bekommt jeder Mitarbeiter seine Abrechnung per Mail -- der
-- Lohn-Waechter legt die Mail als Entwurf an, das Buero drueckt auf Senden.
-- Wer sie ein halbes Jahr spaeter noch einmal braucht, sucht im Postfach.
-- Hier liegen sie stattdessen in der App, nach Monat sortiert.
--
-- WAS HIER DRINSTEHT, IST BESONDERS SCHUTZBEDUERFTIG. Eine
-- Entgeltabrechnung nennt Verdienst, Steuerklasse, Sozialversicherungs-
-- nummer und Konfession. Deshalb:
--
--   1. Die Datei selbst liegt in einem PRIVATEN Bucket. Keine oeffentliche
--      Adresse, nie. Zum Herunterladen erzeugt der Server eine Adresse mit
--      kurzer Gueltigkeit, die nirgends gespeichert wird.
--   2. Diese Tabelle haelt nur, wo die Datei liegt und zu wem sie gehoert.
--      Keine Betraege.
--   3. Die Zuordnung kommt nicht aus der Reihenfolge im Sammel-PDF, sondern
--      aus dem Namen im Adressblock, gegengeprueft mit der Personalnummer
--      der Lohnbuchhaltung.
--
-- Der Zugriff laeuft ausschliesslich ueber den Server: Die App fragt nach
-- "meinen" Abrechnungen, der Server nimmt dafuer das angemeldete Profil.
-- Welcher Mitarbeiter gemeint ist, sagt nie die Anfrage.

create table if not exists lohn_dokumente (
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

-- Je Mitarbeiter, Monat und Art genau ein Dokument. Laeuft die Abholung
-- zweimal, wird ersetzt statt verdoppelt.
create unique index if not exists lohn_dokumente_eindeutig_idx
  on lohn_dokumente (employee_profile_id, jahr, monat, art);

create index if not exists lohn_dokumente_person_idx
  on lohn_dokumente (employee_profile_id, jahr desc, monat desc);

comment on table lohn_dokumente is
  'Entgeltabrechnungen je Mitarbeiter. Haelt nur den Verweis, die Datei liegt im privaten Bucket lohn-dokumente.';
comment on column lohn_dokumente.pfad is
  'Pfad im privaten Bucket. Wird nie an den Browser gegeben, nur eine kurzlebige signierte Adresse.';
comment on column lohn_dokumente.gesehen_at is
  'Wann der Mitarbeiter sie zuletzt geoeffnet hat. Damit das Buero sieht, ob sie angekommen ist.';

-- Die Zeilen liest und schreibt ausschliesslich der Server mit dem
-- Service-Schluessel. Fuer alle anderen ist die Tabelle zu.
alter table lohn_dokumente enable row level security;

-- Kontrolle.
select count(*) as dokumente from lohn_dokumente;
