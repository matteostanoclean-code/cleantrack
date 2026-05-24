# CleanTrack Pro Mobile-App

Next.js/Vercel App für Mitarbeiter, Einsatzplan, Stempeluhr, Qualitätsnachweise, Materialmeldungen, Admin-Freigaben und Auswertungen.

## Neu in dieser Version

- Meldungszentrale in der Mitarbeiter-App
- Glocke oben rechts ist klickbar
- Badge für ungelesene Meldungen
- Chat-Antworten vom Büro werden gesammelt angezeigt
- Abwesenheitsentscheidungen werden sichtbar angezeigt
- Meldungen können als gelesen markiert werden

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

Neue Funktion:

- Vercel Cron ruft alle 15 Minuten `/api/cron/task-reminders` auf
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
