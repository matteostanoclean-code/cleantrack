# CleanTrack Pro Mobile App

Mobile App im dunklen Google-AI-Studio-Layout mit echter Supabase-Anbindung und Mitarbeiter-Login.

## Enthalten

- Login über Supabase Auth
- automatische Mitarbeiter-Erkennung über `employee_profiles.auth_user_id`
- Home Dashboard aus echten Daten
- Einsatzplan aus `tasks`
- Aufgaben abhaken in `tasks.done`
- Stempeluhr mit Speicherung in `time_entries`
- Stundenzettel aus `time_entries`
- Abwesenheiten aus `absence_requests`
- Admin-Auswahl nur für Profile mit `role = admin`

## Wichtige Supabase-Regel

Ein Login funktioniert nur, wenn in `employee_profiles` diese Felder passen:

- `auth_user_id` = Supabase Auth User ID
- `active` = true
- `name` muss zu `tasks.employee_name` passen

Beispiel: Wenn Aufgaben für `Matteo Stano` angelegt sind, muss das eingeloggte Profil auch `name = Matteo Stano` haben.

## Vercel Environment Variables

Diese Variablen müssen in Vercel unter Settings → Environment Variables vorhanden sein:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SITE_URL=
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=
```

## Start

```bash
npm install
npm run build
npm run dev
```

## Update: Mobile Mehr-Funktionen

Diese Version ergänzt in der Mitarbeiter-App unter **Mehr**:

- Material melden → speichert in `material_reports` und erstellt `admin_notifications`
- Abwesenheit beantragen → speichert in `absence_requests` und erstellt `admin_notifications`
- Chat → speichert in `chat_messages` und erstellt eine Admin-Meldung
- Profil → zeigt die eingeloggten Mitarbeiterdaten

Falls eine Tabelle oder Spalte fehlt, kann die Datei `supabase/mobile_mehr_funktionen.sql` im Supabase SQL Editor ausgeführt werden.

## Admin-Freigaben

Neue Seite:

```text
/mitarbeiter/freigaben
```

Damit kann der Admin offene Abwesenheiten, Materialmeldungen, Chat-Nachrichten und Admin-Meldungen bearbeiten. Die Seite nutzt Supabase Auth und ist nur für Profile mit `role = admin` freigeschaltet.

## Update: Serien-Einsätze

Im mobilen Admin-Dashboard unter `/mitarbeiter/admin` können Einsätze jetzt auch als Serie angelegt werden:

- einmalig
- täglich
- wöchentlich mit Wochentagen
- monatlich

Beim Speichern werden echte Einträge in `tasks` erstellt und mit `recurrence_group_id` verbunden.

## Version: Qualitätsnachweise

Neue Mitarbeiter-Funktion unter `Mehr → Qualitätsnachweis` bzw. `/mitarbeiter/quality`.

Die App lädt Reinigungspläne aus:

- `cleaning_plans`
- `cleaning_plan_items`

und speichert Nachweise über:

- `quality_reports` (optional, SQL-Datei ausführen)
- `admin_notifications` (immer als Admin-Meldung)
- `tasks` (`done=true`, `status=done`)

Optionale SQL-Datei:

```text
supabase/mobile_qualitaetsnachweise.sql
```

## Update: Foto-Upload für Qualitätsnachweise

Neu: Mitarbeiter können beim Qualitätsnachweis Fotos hochladen. Die Bilder landen im Supabase Storage Bucket `quality-photos` und werden in `quality_reports.photo_urls` gespeichert.

Vor dem Testen bitte in Supabase ausführen:

- `supabase/mobile_foto_qualitaetsnachweise.sql`
- falls die Stempeluhr blockiert: `supabase/mobile_stempeluhr_action_fix.sql`

## Update: Foto-Upload für Materialmeldungen

Neu: Mitarbeiter können bei **Mehr → Material melden** Fotos anhängen. Die Bilder landen im Supabase Storage Bucket `material-photos` und werden in `material_reports.photo_urls` gespeichert.

Vor dem Testen bitte in Supabase ausführen:

```text
supabase/mobile_material_foto_upload.sql
```

Der Admin sieht die Fotos anschließend unter:

```text
/mitarbeiter/freigaben → Material
```


## GPS-Stempeluhr

Diese Version speichert beim Stempeln den Browser-GPS-Standort in `time_entries.latitude` und `time_entries.longitude`.
Wenn beim Objekt in `work_sites` die Felder `latitude` und `longitude` gesetzt sind, prüft die API den Abstand gegen `allowed_radius_m`.

Vor dem Testen bitte einmal in Supabase ausführen:

```text
supabase/mobile_gps_stempeluhr.sql
```

Objekt-GPS setzen:

```text
/mitarbeiter/admin → Objekte → Objekt bearbeiten → Hier bin ich → Objekt speichern
```

Danach beim Mitarbeiter testen:

```text
/mitarbeiter → Stempeluhr → Objekt wählen → Einstempeln
```

## Fix: Termine + Stempeluhr

Diese Version koppelt die Stempeluhr an einen konkreten Termin. Manuelles Buchen ohne Termin ist in der App und in der API gesperrt.

Nach dem Upload bitte einmal in Supabase ausführen:

```text
supabase/mobile_termin_stempeluhr_fix.sql
```

## Update: Termin-Detail Pflichtablauf

Diese Version führt einen saubereren Mitarbeiter-Ablauf ein:

- Einsätze im Einsatzplan werden zuerst als Termin-Detail geöffnet.
- Stempeln startet nur noch aus dem Termin-Detail heraus.
- Die Termin-Detailseite zeigt Datum, Uhrzeit, Objekt, Kunde, GPS-Status, Checkliste und zugehörige Zeitbuchungen.
- Von dort kann der Mitarbeiter Route, Stempeluhr und Qualitätsnachweis öffnen.
- Zeiten werden weiterhin mit `task_id` an den konkreten Termin gekoppelt.

Nach dem Upload wie gewohnt:

```powershell
git add .
git commit -m "Add task detail workflow"
git push
```

## Update: Admin-Tageszentrale

Neue Seite:

```text
/mitarbeiter/admin/tageszentrale
```

Funktion:

- zeigt nur heutige Einsätze
- zeigt Live-Status: Offen, Geplant, In Arbeit, Pause, Überfällig, Erledigt
- filtert alte Aufträge aus der Tagesansicht
- zeigt letzte Stempelaktion und GPS-Abstand, falls vorhanden
- Admin kann Einsätze direkt als erledigt markieren oder wieder öffnen
- Link ist unter Mehr → Tageszentrale und im Admin-Dashboard ergänzt

Für dieses Update ist kein neues SQL nötig.

## Update: Admin-Monatsauswertung

Neue Seite:

```text
/mitarbeiter/admin/auswertung
```

Funktionen:

- Monatsfilter
- Mitarbeiterfilter
- Ist-Stunden aus `time_entries`
- Plan-Stunden aus `tasks`
- offene Buchungen erkennen
- GPS-Warnungen anzeigen
- CSV-Export für Mitarbeiterstunden
- CSV-Export für Stempelprotokoll

Für dieses Update ist kein neues SQL notwendig.
