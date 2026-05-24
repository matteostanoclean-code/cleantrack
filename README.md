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
