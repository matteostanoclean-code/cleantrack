-- Notizzettel: kurzfristige Dinge mit Faelligkeit.
--
-- Bewusst nicht dieselbe Tabelle wie die Aufgaben. Eine Reklamation ist ein
-- Vorgang mit Kuerzel, Zustaendigkeit und Verlauf — ein Notizzettel ist ein
-- Satz und ein Datum. Beides in einen Topf zu werfen macht aus dem Zettel
-- ein Formular, und dann schreibt man nichts mehr rein.
--
-- Deshalb: Titel, Datum, erledigt. Alles andere ist freiwillig.

create table if not exists notes (
  id           uuid primary key default gen_random_uuid(),
  titel        text not null,
  beschreibung text,
  faellig_am   date,
  -- Uhrzeit nur, wenn es ein Termin ist. Ein Todo hat keine.
  uhrzeit      time,
  wichtig      boolean not null default false,
  erledigt     boolean not null default false,
  erledigt_am  timestamptz,
  -- Freier Text statt fester Liste. Wer sich eine Ordnung ausdenken muss,
  -- bevor er etwas notieren darf, notiert es nicht.
  bereich      text,
  work_site_id uuid,
  object_name  text,
  besitzer     text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists notes_faellig_idx on notes (erledigt, faellig_am);
create index if not exists notes_besitzer_idx on notes (besitzer, erledigt);

comment on table notes is
  'Kurzfristige Notizen und Termine mit Faelligkeit. Getrennt von den Aufgaben-Vorgaengen.';
comment on column notes.uhrzeit is
  'Nur bei Terminen gesetzt. Ohne Uhrzeit ist es ein Todo fuer den Tag.';
comment on column notes.bereich is
  'Freier Text zum Gruppieren, zum Beispiel Steuerberater, Verein, Fuhrpark.';
