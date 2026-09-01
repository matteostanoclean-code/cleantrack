# Schichtklar

Next.js/Vercel-App für Matteo Stano Clean: Einsatzplan, Stempeluhr mit
Standortprüfung, Zeitenfreigabe, Qualitätsnachweise, Material, Abwesenheiten,
Chat und Adminbereich.

**Live:** https://cleantrack-xi.vercel.app

---

## Stand 11.08.2026

### Reparaturen

- **Vercel-Build ging seit dem 02.08. nicht mehr durch.** Ursache: alle 162
  Einträge in `package-lock.json` verwiesen auf einen internen Zwischenserver
  (`packages.applied-caas-gateway1.internal.api.openai.org`), der von Vercel
  nicht erreichbar ist. Jeder Download lief in das 5-Minuten-Timeout aus der
  `.npmrc`, danach in die Wiederholungen, am Ende stürzte npm ab. Lokal fiel es
  nie auf, weil die Pakete im Zwischenspeicher lagen. Lockfile in einem leeren
  Verzeichnis neu erzeugt, dazu Node 24 statt des abgekündigten Node 20 und
  `installCommand: npm ci`.
- **Stempeluhr sperrte Mitarbeiter aus.** Eine Uhr, die von einem früheren Tag
  offen stand, ließ kein neues Einstempeln zu. Sie wird jetzt automatisch
  beendet, gebucht bis zum geplanten Feierabend, und geht zur Prüfung ins Büro.
- **Chat kam nie an.** Nachrichten des Büros wurden im eigenen Verlauf
  gespeichert statt im Verlauf des Mitarbeiters. Admins wählen jetzt den
  Empfänger über die Mitarbeiterauswahl.
- **Mitarbeiter anlegen war nicht auffindbar** — nur im Dashboard-Tab, während
  das Menü lediglich „aktivieren" anbot, was ohne Profile leer bleibt.
- **Rückmeldungen beim Speichern** standen oben auf der Seite, die Knöpfe unten.
  Am Handy sah Speichern deshalb wirkungslos aus. Meldung klebt jetzt unten.
- Fahrzeit wurde nie geladen (`travel_minutes` fehlte in der Abfrage).
- Unlesbare Knöpfe (dunkelgrau auf dunkelgrün) und englische Statuswörter
  (`open`, `done`) in den Freigaben korrigiert.

### Neue Funktionen

- **Zeitenfreigabe** (`/mitarbeiter/admin/zeiten`): prüft jede erfasste Zeit,
  nicht nur Überzeit. Zeigt Soll gegen Ist, Unterschreitung, Standortfehler mit
  Kartenlink, erlaubt Korrektur von Von/Bis/Pause/Fahrzeit vor der Freigabe und
  das Nachtragen vergessener Ausstempelungen. Filter nach Zeitraum, Status,
  Mitarbeiter, Objekt.
- **Zeit nachtragen** für Mitarbeiter: vergangene Einsätze ohne Stempelung
  erscheinen im Stundenzettel als „Nicht erfasst" und können mit Von, Bis,
  Pause und Pflicht-Grund nachgereicht werden. Geht als ausstehend ins Büro.
- **Stempelregeln:** Einstempeln und Pausen nur innerhalb 150 m vom Objekt.
  Ausstempeln ist überall möglich, wird aber mit Abstand festgehalten und
  geprüft — wer erst zu Hause merkt, dass er vergessen hat, muss es buchen
  können. Begründungspflicht bei mehr als 5 Minuten über der geplanten Zeit.
- **Standortanzeige vor dem Stempeln** mit Entfernung, erlaubtem Radius und
  Messgenauigkeit, dazu eine Karte mit dem Objekt.
- **Material:** mehrere Artikel in einer Bestellung, Objektauswahl mit „In der
  Nähe" nach Entfernung, Bestell-Detail mit Artikelliste und „als erhalten
  melden".
- **Qualitätskontrolle** mit Sternebewertung zusätzlich zur Checkliste.

### Umgestellt

- Komplettes neues Design für alle 18 Mitarbeiter-Bildschirme und alle
  Admin-Seiten: ruhige Listen mit Detailzeilen statt Kartenstapel, gemeinsame
  Bausteine in `components/ui.tsx`, Formate in `lib/format.ts`.
- Admin-Startseite gruppiert (Zu erledigen, Planen, Stammdaten, Auswerten)
  statt zwölf gleich aussehender Knöpfe.
- Tageszentrale mit farbigen Statusboxen inklusive „Nicht zugewiesen".
- Der nachgebaute Handy-Rahmen um die Admin-Seiten ist entfernt.
- **Modul Kundenabrechnung entfernt** (Seite und Schnittstelle).
- Startseite ohne Entwicklertexte, `/dashboard` und `/rechner` leiten weiter.
- Sechs Bootstrap-Abfragen laufen gleichzeitig statt nacheinander.

### Bewusste Entscheidungen

- **Kein freies Stempeln ohne geplanten Einsatz.** Jede Minute hat damit ein
  Objekt, ein Soll und einen Ansprechpartner.
- **Einsatz-Erinnerungen laufen über Supabase `pg_cron`**, nicht über Vercel:
  der Hobby-Tarif erlaubt nur einen täglichen Lauf, Erinnerungen brauchen alle
  15 Minuten einen.

### SQL-Skripte in `supabase/`

Alle sind einzeln ausführbar und zeigen vor dem Ändern, was passiert.

| Datei | Zweck | Pflicht? |
|---|---|---|
| `zeitenfreigabe_und_material.sql` | 3 Spalten für Fahrzeit und korrigierte Zeiten | optional |
| `qualitaet_sterne.sql` | Spalte `rating` für die Sternebewertung | nötig, sonst gehen Sterne verloren |
| `einsatz_erinnerungen_aktivieren.sql` | Push-Erinnerungen per pg_cron | für Erinnerungen |
| `daten_zuruecksetzen.sql` | Einsätze, Zeiten, Mitarbeiter löschen | erledigt |
| `kunden_aus_csv.sql` | Kunden und Objekte aus Kontakte.csv | erledigt |
| `test_einladungen_loeschen.sql` | alte Test-Einladungen entfernen | optional |

### Offen

- Geräte- und Inventarverwaltung mit QR-Codes
- QR- oder NFC-Scan am Objekt als Alternative zur Standortprüfung
- Nach kleinen Aktionen lädt die App noch alle Daten neu

---

## Ältere Notizen

## Upload

```powershell
git add .
git commit -m "Add mobile notification center"
git push
```

## Umgebung in Vercel

Die vorhandenen Supabase-Variablen müssen gesetzt bleiben:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```


## Update: Tagesroute

- Neue Mitarbeiter-Funktion `Mehr → Tagesroute`
- Zeigt nur Einsätze des gewählten Tages
- Öffnet Google Maps mit den offenen Einsätzen in Reihenfolge
- Kein neues SQL nötig


## Update: Objektmappe

Neu: `/mitarbeiter/objects` und Menüpunkt `Objektmappe`. Mitarbeiter sehen Objektinfos, kommende Einsätze, Reinigungsplan, GPS-Status und Material je Objekt. Außerdem ist die Tagesroute jetzt direkt im Mehr-Menü sichtbar.

## Update: Objektmeldung

Neue Funktion in der Mitarbeiter-App:

- Mehr → Objektmeldung
- Schäden, Mängel, Kundenhinweise und Sicherheitsprobleme melden
- optional bis zu 6 Fotos anhängen
- Meldung wird als `admin_notifications.notification_type = object_issue` gespeichert
- Fotos werden in Supabase Storage Bucket `issue-photos` gespeichert

Kein SQL nötig. Die Funktion nutzt die vorhandene Tabelle `admin_notifications`.

## Update: Push-Benachrichtigungen

Neue Funktionen:

- Mitarbeiter-App: `Mehr → Push aktivieren`
- API zum Speichern von Push-Subscriptions: `/api/mobile/push/subscribe`
- API für Testmeldung: `/api/mobile/push/test`
- Service Worker mit Push- und Notification-Click-Handler

Supabase SQL einmal ausführen:

```text
supabase/mobile_push_benachrichtigungen.sql
```

Vercel Environment Variables prüfen:

```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:kontakt@matteostano-clean.de
```

## Update: Automatische Einsatz-Erinnerungen

> Überholt: Der Vercel-Cron dafür wurde am 24.05.2026 wieder entfernt, weil der
> Hobby-Tarif nur einen täglichen Lauf erlaubt. Auslöser ist heute Supabase
> `pg_cron`, siehe `supabase/einsatz_erinnerungen_aktivieren.sql`.

Neue Funktion:

- Cron ruft alle 15 Minuten `/api/cron/task-reminders` auf
- Mitarbeiter bekommen Push-Erinnerungen ca. 60 Minuten und ca. 15 Minuten vor Einsatzbeginn
- Erinnerung wird nur einmal pro Einsatz und Stufe gesendet
- Alte/stale Push-Geräte werden automatisch deaktiviert

Supabase SQL einmal ausführen:

```text
supabase/mobile_einsatz_erinnerungen.sql
```

Optional in Vercel setzen:

```env
CRON_SECRET=
```

Wenn `CRON_SECRET` gesetzt ist, muss der Cron-Aufruf den passenden Bearer-Token senden. Ohne `CRON_SECRET` läuft der Cron direkt über Vercel.

Upload:

```powershell
git add .
git commit -m "Add automatic task push reminders"
git push
```

## Update: Admin Push-Zentrale

Neue Funktion:

- Admin-Seite: `/mitarbeiter/admin/push`
- erreichbar über `Mehr → Push-Zentrale`
- Admin kann sofort eine Push-Nachricht an einen Mitarbeiter oder alle aktiven Mitarbeiter senden
- Nachricht wird zusätzlich in `admin_notifications` gespeichert, damit sie in der App unter Meldungen sichtbar bleibt
- Mitarbeiter ohne aktiviertes Push-Gerät bekommen trotzdem die interne App-Meldung

Kein neues SQL nötig, wenn `mobile_push_benachrichtigungen.sql` bereits ausgeführt wurde.

Upload:

```powershell
git add .
git commit -m "Add admin manual push center"
git push
```

## Update: Mitarbeiter-Stammdaten + Geburtstage

Neue Funktion:

- Mitarbeiter können im Admin-Dashboard mit Stundensatz, Urlaubsanspruch/Jahr, Monatsstunden und Geburtstag gepflegt werden
- Mitarbeiter sehen im Profil Stundensatz, Urlaubsanspruch und Geburtstag
- Am Geburtstag sieht der Mitarbeiter automatisch einen Geburtstagsgruß in der App
- Admin sieht Geburtstage in der Dashboard-Übersicht
- Vercel Cron erstellt täglich um 06:00 Uhr Geburtstag-Meldungen in `admin_notifications`

Supabase SQL einmal ausführen:

```text
supabase/mobile_mitarbeiter_stammdaten_geburtstage.sql
```

Upload:

```powershell
git add .
git commit -m "Add employee master data and birthday reminders"
git push
```

## Update: Kundenabrechnung

> Entfernt am 11.08.2026. Seite und Schnittstelle sind gelöscht, der Code liegt
> in der Versionsgeschichte.

## Update: Kunden-Jahresplanung und Objekte

- Admin-Dashboard Tabs umbrechen jetzt, damit „Objekte“ nicht mehr rechts abgeschnitten ist.
- Objekte findest du im Admin-Dashboard im Tab **Objekte**.
- Beim Kunden anlegen/bearbeiten kann jetzt eine Jahresplanung erzeugt werden:
  - Arbeitstage auswählen
  - Start-/Endzeit eintragen
  - Planungslimit pro Tag in Stunden eintragen
  - optional Objekt auswählen
  - Termine werden für 1 Jahr in `tasks` erstellt
  - die Termine bleiben zuerst ohne Mitarbeiter
- Serien-Einsätze können später im Tab **Einsätze** auf einen Mitarbeiter übertragen werden.

Vor dem Deploy bitte `supabase/mobile_customer_year_planning.sql` in Supabase ausführen.

## Update: Admin-Planungszentrale

Neu in dieser Version:

- `/mitarbeiter/admin/planung` als Planungszentrale
- Wochenplan mit direkten Mitarbeiter-Zuweisungen
- Liste aller offenen Einsätze ohne Mitarbeiter
- Serienverwaltung für Jahresplanungen und wiederkehrende Einsätze
- Serie ab heute einem Mitarbeiter zuweisen
- Serie ab heute bearbeiten: Startzeit, Endzeit, Planminuten
- Serie ab heute pausieren oder wieder öffnen
- Admin-Dashboard-Buttonleiste horizontal scrollbar, damit Buttons auf dem Handy nicht abgeschnitten werden

Kein neues Supabase-SQL nötig.

## Update: Admin-Urlaubsplanung

Neu:

- `/mitarbeiter/admin/urlaub`
- Urlaub, Krankheit und freie Tage als Admin eintragen
- offene Abwesenheitsanträge genehmigen oder ablehnen
- Einsatz-Konflikte im Abwesenheitszeitraum erkennen
- betroffene Einsätze direkt wieder auf „ohne Mitarbeiter“ setzen
- Urlaubskonto pro Mitarbeiter anzeigen

Für dieses Update ist kein neues SQL nötig. Es nutzt `absence_requests`, `tasks`, `employee_profiles` und `admin_notifications`.

## Update: Admin-Kapazitätsplanung

Neue Admin-Seite:

- `/mitarbeiter/admin/kapazitaet`

Funktionen:

- Monatsweise Planstunden je Mitarbeiter aus `tasks`
- Iststunden aus `time_entries`
- Sollstunden aus `employee_profiles.monthly_hour_limit`
- Stundensatz aus `employee_profiles.hourly_rate`
- Arbeitgeberfaktor aus `employee_profiles.employer_cost_factor`
- Urlaubstage aus `absence_requests`
- Warnung bei Überlastung, offenen Stempeluhren und unbesetzten Einsätzen
- CSV-Export für die Monatsplanung

Für dieses Update ist kein neues SQL nötig.
