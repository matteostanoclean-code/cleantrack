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
