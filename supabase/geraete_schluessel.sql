-- Geraeteschluessel: langlebiger Zugang fuer eigene Geraete.
--
-- Warum es das braucht: Die Anmeldung in Schichtklar laeuft ueber Supabase,
-- und diese Zugaenge laufen bewusst nach kurzer Zeit ab. Fuer den Browser ist
-- das richtig. Fuer die Brutus-App auf dem Handy ist es unbrauchbar - sie
-- soll einmal eingerichtet werden und dann monatelang laufen.
--
-- Deshalb ein eigener Schluessel je Geraet: langlebig, einzeln abschaltbar,
-- und er haengt an genau einem Mitarbeiterprofil.
--
-- Gespeichert wird NICHT der Schluessel, sondern nur seine Pruefsumme. Wer
-- die Tabelle liest, kann sich damit nicht anmelden. Den Schluessel selbst
-- bekommt man genau einmal zu sehen, beim Erzeugen.

create table if not exists device_tokens (
  id           uuid primary key default gen_random_uuid(),
  -- SHA-256 des Schluessels als Hex. Nie der Schluessel selbst.
  pruefsumme   text not null unique,
  -- Wofuer der Schluessel ist, z.B. "Handy Matteo".
  bezeichnung  text not null,
  profil_id    uuid not null,
  besitzer     text,
  erstellt_am  timestamptz not null default now(),
  -- Wann zuletzt damit gearbeitet wurde. Macht sichtbar, welcher Schluessel
  -- tot ist und geloescht werden kann.
  zuletzt_am   timestamptz,
  aktiv        boolean not null default true
);

create index if not exists device_tokens_pruefsumme_idx on device_tokens (pruefsumme) where aktiv;
create index if not exists device_tokens_profil_idx on device_tokens (profil_id, aktiv);

comment on table device_tokens is
  'Langlebige Zugaenge fuer eigene Geraete, etwa die Brutus-App. Gespeichert wird nur die Pruefsumme.';
comment on column device_tokens.pruefsumme is
  'SHA-256 des Schluessels. Der Schluessel selbst wird nirgends abgelegt.';
