-- Einstellungen: betriebsweite Werte und die kleinen Stammlisten.
--
-- Zwei Tabellen reichen.
--
-- 1. app_settings: alles, was genau einen Wert hat. Ein Schluessel, ein Wert.
--    Neue Einstellung heisst neuer Schluessel, nie eine neue Spalte.
--
-- 2. settings_lists: alle Listen in einer Tabelle, unterschieden durch die
--    Spalte "liste". Auftragsarten, Lohnarten, Feiertage, Lieferanten und so
--    weiter haben je drei bis zehn Zeilen. Dafuer neun einzelne Tabellen
--    anzulegen waere Aufwand ohne Gegenwert, und jede neue Liste braeuchte
--    wieder eine Wanderung durch die Datenbank. So kostet eine neue Liste
--    gar nichts.
--
-- Das Besondere je Art steht in "daten" als JSON. Was alle Listen teilen
-- (Name, Nummer, Farbe, aktiv, Reihenfolge) steht als richtige Spalte, damit
-- man danach sortieren und filtern kann.
--
-- Einmal ausfuehren im Supabase SQL Editor. Laeuft der Block ein zweites Mal,
-- passiert nichts Doppeltes: die Seed-Zeilen pruefen vorher, ob es sie schon
-- gibt.

create table if not exists app_settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

create table if not exists settings_lists (
  id          uuid primary key default gen_random_uuid(),
  liste       text not null,
  name        text not null,
  nummer      integer,
  farbe       text,
  aktiv       boolean not null default true,
  sortierung  integer not null default 0,
  daten       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists settings_lists_liste_idx on settings_lists (liste, sortierung, name);

-- ---------------------------------------------------------------------------
-- Startwerte
-- ---------------------------------------------------------------------------

-- Auftragsarten. Das sind zugleich die Objekt-Tags: was an einem Objekt
-- gemacht wird. Bisher standen die sechs fest im Code, ab jetzt hier.
insert into settings_lists (liste, name, farbe, sortierung, daten)
select * from (values
  ('auftragsarten', 'Unterhaltsreinigung',   '#FF9500',  1, '{}'::jsonb),
  ('auftragsarten', 'Glasreinigung',         '#FF9500',  2, '{}'::jsonb),
  ('auftragsarten', 'Treppenhausreinigung',  '#FF9500',  3, '{}'::jsonb),
  ('auftragsarten', 'Gartenarbeiten',        '#34C759',  4, '{}'::jsonb),
  ('auftragsarten', 'Bauendreinigung',       '#FF9500',  5, '{}'::jsonb),
  ('auftragsarten', 'Wohnungsreinigung',     '#FF3B30',  6, '{}'::jsonb),
  ('auftragsarten', 'Grundreinigung',        '#FF9500',  7, '{}'::jsonb),
  ('auftragsarten', 'Sonderreinigung',       '#FF9500',  8, '{}'::jsonb),
  ('auftragsarten', 'Winterdienst',          '#5AC8FA',  9, '{}'::jsonb)
) as neu(liste, name, farbe, sortierung, daten)
where not exists (select 1 from settings_lists where liste = 'auftragsarten');

-- Abwesenheitsarten mit den Lohnnummern aus der Lohnbuchhaltung.
insert into settings_lists (liste, name, nummer, farbe, sortierung, daten)
select * from (values
  ('abwesenheitsarten', 'Krankheit',                200, '#FF9500', 1,
   '{"bezahlt": true, "beantragbar": true, "reduziert_urlaub": false}'::jsonb),
  ('abwesenheitsarten', 'Urlaub',                   201, '#FF9500', 2,
   '{"bezahlt": true, "beantragbar": true, "reduziert_urlaub": true}'::jsonb),
  ('abwesenheitsarten', 'Unbezahlte Freistellung',  202, '#FF3B30', 3,
   '{"bezahlt": false, "beantragbar": true, "reduziert_urlaub": false}'::jsonb)
) as neu(liste, name, nummer, farbe, sortierung, daten)
where not exists (select 1 from settings_lists where liste = 'abwesenheitsarten');

-- Lohnarten.
insert into settings_lists (liste, name, nummer, sortierung, daten)
select * from (values
  ('lohnarten', 'Teilzeit', 1, 1, '{"brutto_stundenlohn": 15.00, "lohnkosten": null, "beschreibung": null}'::jsonb),
  ('lohnarten', 'Minijob',  2, 2, '{"brutto_stundenlohn": 15.00, "lohnkosten": null, "beschreibung": null}'::jsonb),
  ('lohnarten', 'Minijob',  3, 3, '{"brutto_stundenlohn": 16.00, "lohnkosten": null, "beschreibung": null}'::jsonb)
) as neu(liste, name, nummer, sortierung, daten)
where not exists (select 1 from settings_lists where liste = 'lohnarten');

-- Aufgabentypen. Die Kuerzel muessen zu denen in der Aufgabenliste passen.
insert into settings_lists (liste, name, farbe, sortierung, daten)
select * from (values
  ('aufgabentypen', 'Reklamation',   '#FF9500', 1, '{"praefix": "REKL", "fuer_kunden": false}'::jsonb),
  ('aufgabentypen', 'Personal',      '#FFCC00', 2, '{"praefix": "PERS", "fuer_kunden": false}'::jsonb),
  ('aufgabentypen', 'Kundenanfrage', '#5AC8FA', 3, '{"praefix": "KUND", "fuer_kunden": false}'::jsonb),
  ('aufgabentypen', 'Sonstiges',     '#8E8E93', 4, '{"praefix": "SONS", "fuer_kunden": false}'::jsonb)
) as neu(liste, name, farbe, sortierung, daten)
where not exists (select 1 from settings_lists where liste = 'aufgabentypen');

-- Rechtegruppen. Das Zugriffslevel entscheidet, wer mehr darf als er selbst
-- ist: ab 8 sieht jemand das Buero, ab 5 die eigenen Objekte.
insert into settings_lists (liste, name, farbe, sortierung, daten)
select * from (values
  ('rechtegruppen', 'Admin',          '#5856D6', 1,
   '{"level": 10, "dashboard": true,  "einstellungen": true,  "lohndaten": true,  "dokumente": true,  "app": true,  "objektleiterfilter": false}'::jsonb),
  ('rechtegruppen', 'Innendienst',    '#007AFF', 2,
   '{"level": 8,  "dashboard": true,  "einstellungen": false, "lohndaten": true,  "dokumente": true,  "app": true,  "objektleiterfilter": false}'::jsonb),
  ('rechtegruppen', 'Objektleiter',   '#5AC8FA', 3,
   '{"level": 5,  "dashboard": true,  "einstellungen": false, "lohndaten": false, "dokumente": false, "app": true,  "objektleiterfilter": true}'::jsonb),
  ('rechtegruppen', 'Reinigungskraft','#34C759', 4,
   '{"level": 1,  "dashboard": false, "einstellungen": false, "lohndaten": false, "dokumente": false, "app": true,  "objektleiterfilter": false}'::jsonb),
  ('rechtegruppen', 'Servicekraft',   '#34C759', 5,
   '{"level": 1,  "dashboard": false, "einstellungen": false, "lohndaten": false, "dokumente": false, "app": true,  "objektleiterfilter": false}'::jsonb)
) as neu(liste, name, farbe, sortierung, daten)
where not exists (select 1 from settings_lists where liste = 'rechtegruppen');

-- Lieferanten fuers Material.
insert into settings_lists (liste, name, nummer, sortierung, daten)
select * from (values
  ('lieferanten', 'hygi.de', 1, 1, '{"email": null}'::jsonb)
) as neu(liste, name, nummer, sortierung, daten)
where not exists (select 1 from settings_lists where liste = 'lieferanten');

-- Gesetzliche Feiertage Baden-Württemberg, 2026 und 2027.
-- Die beweglichen haengen an Ostern: 2026 faellt Ostersonntag auf den 5. April,
-- 2027 auf den 28. Maerz. Bewusst ausgeschrieben statt gerechnet, damit man
-- jede Zeile nachschlagen kann.
insert into settings_lists (liste, name, sortierung, daten)
select * from (values
  ('feiertage', 'Neujahr',                    1,  '{"datum": "2026-01-01", "region": "BW"}'::jsonb),
  ('feiertage', 'Heilige Drei Könige',       2,  '{"datum": "2026-01-06", "region": "BW"}'::jsonb),
  ('feiertage', 'Karfreitag',                 3,  '{"datum": "2026-04-03", "region": "BW"}'::jsonb),
  ('feiertage', 'Ostermontag',                4,  '{"datum": "2026-04-06", "region": "BW"}'::jsonb),
  ('feiertage', 'Tag der Arbeit',             5,  '{"datum": "2026-05-01", "region": "BW"}'::jsonb),
  ('feiertage', 'Christi Himmelfahrt',        6,  '{"datum": "2026-05-14", "region": "BW"}'::jsonb),
  ('feiertage', 'Pfingstmontag',              7,  '{"datum": "2026-05-25", "region": "BW"}'::jsonb),
  ('feiertage', 'Fronleichnam',               8,  '{"datum": "2026-06-04", "region": "BW"}'::jsonb),
  ('feiertage', 'Tag der Deutschen Einheit',  9,  '{"datum": "2026-10-03", "region": "BW"}'::jsonb),
  ('feiertage', 'Allerheiligen',              10, '{"datum": "2026-11-01", "region": "BW"}'::jsonb),
  ('feiertage', '1. Weihnachtsfeiertag',      11, '{"datum": "2026-12-25", "region": "BW"}'::jsonb),
  ('feiertage', '2. Weihnachtsfeiertag',      12, '{"datum": "2026-12-26", "region": "BW"}'::jsonb),
  ('feiertage', 'Neujahr',                    13, '{"datum": "2027-01-01", "region": "BW"}'::jsonb),
  ('feiertage', 'Heilige Drei Könige',       14, '{"datum": "2027-01-06", "region": "BW"}'::jsonb),
  ('feiertage', 'Karfreitag',                 15, '{"datum": "2027-03-26", "region": "BW"}'::jsonb),
  ('feiertage', 'Ostermontag',                16, '{"datum": "2027-03-29", "region": "BW"}'::jsonb),
  ('feiertage', 'Tag der Arbeit',             17, '{"datum": "2027-05-01", "region": "BW"}'::jsonb),
  ('feiertage', 'Christi Himmelfahrt',        18, '{"datum": "2027-05-06", "region": "BW"}'::jsonb),
  ('feiertage', 'Pfingstmontag',              19, '{"datum": "2027-05-17", "region": "BW"}'::jsonb),
  ('feiertage', 'Fronleichnam',               20, '{"datum": "2027-05-27", "region": "BW"}'::jsonb),
  ('feiertage', 'Tag der Deutschen Einheit',  21, '{"datum": "2027-10-03", "region": "BW"}'::jsonb),
  ('feiertage', 'Allerheiligen',              22, '{"datum": "2027-11-01", "region": "BW"}'::jsonb),
  ('feiertage', '1. Weihnachtsfeiertag',      23, '{"datum": "2027-12-25", "region": "BW"}'::jsonb),
  ('feiertage', '2. Weihnachtsfeiertag',      24, '{"datum": "2027-12-26", "region": "BW"}'::jsonb)
) as neu(liste, name, sortierung, daten)
where not exists (select 1 from settings_lists where liste = 'feiertage');

-- Die Werte, die es nur einmal gibt. Firmendaten und Steuernummern stehen auf
-- jedem Ausdruck, die Zeit-Werte steuern die Zeitenfreigabe.
insert into app_settings (key, value) values
  ('firma', '{
      "name": "Matteo Stano Clean Gebäudereinigung",
      "strasse": "Wilhelmstraße 6",
      "plz": "75228",
      "ort": "Ispringen",
      "land": "DE Deutschland",
      "zusatz": "",
      "telefon": "",
      "email": "",
      "web": ""
   }'::jsonb),
  ('steuer', '{
      "ust_id": "DE317889038",
      "steuernummer": "41204/56827",
      "hr_nummer": "",
      "waehrung": "EUR",
      "mwst_ausweis": true,
      "geschaeftsfuehrung": "Matteo Stano",
      "mandantennummer": "",
      "beraternummer": ""
   }'::jsonb),
  ('chat', '{
      "uebersetzer": true,
      "sprachnachrichten": true,
      "logbuch_mitarbeiter": false,
      "logbuch_kunden": false
   }'::jsonb),
  ('kalender', '{ "wochen_taktung": 30 }'::jsonb),
  ('auftrag', '{
      "kostenstelle": "keine",
      "exporte_aufteilen": false,
      "abweichende_rechnungsadresse": false
   }'::jsonb),
  ('zeit', '{
      "fehler_standort": true,
      "fehler_standort_freigabe": true,
      "fehler_freie_zeit": true,
      "fehler_nachtrag": true,
      "unter_prozent": 25,
      "unter_minuten": 10,
      "auf_soll_aufrunden": false,
      "ueber_minuten": 5,
      "gps_aktiv": true,
      "gps_toleranz_m": 150,
      "fahrzeit_aktiv": false,
      "fahrzeit_zwischenzeit": "03:00",
      "fahrzeit_lohnnummer": "22"
   }'::jsonb),
  ('abwesenheit', '{
      "urlaubsanspruch": 30,
      "wartezeit_aktiv": true,
      "wartezeit_monate": 6,
      "uebertrag_tage": 5,
      "resturlaub_aktiv": true,
      "verfall": "3 Monate nach Ende des Zyklus",
      "kunden_benachrichtigen": false,
      "kunden_text": ""
   }'::jsonb),
  ('lohn', '{
      "abrechnungstag": 31,
      "nacht_von": "22:00",
      "nacht_bis": "05:00",
      "land": "Deutschland",
      "region": "Baden-Württemberg"
   }'::jsonb)
on conflict (key) do nothing;
