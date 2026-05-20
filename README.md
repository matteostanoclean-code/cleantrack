# CleanTrack Pro Mobile App

Mobile App im dunklen Google-AI-Studio-Layout mit echter Supabase-Anbindung.

## Enthalten

- Home Dashboard
- Einsatzplan aus `tasks`
- Aufgaben abhaken in `tasks.done`
- Stempeluhr mit Speicherung in `time_entries`
- Stundenzettel aus `time_entries`
- Abwesenheiten aus `absence_requests`
- Mitarbeiterdaten aus `employee_profiles`

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

## Wichtig

Diese Version ist eine Daten-Integrationsversion. Sie nutzt serverseitig den Supabase Service Role Key über API-Routen. Für den produktiven Einsatz sollte danach ein echter Login aktiviert werden, damit jeder Mitarbeiter nur seine eigenen Daten sieht.
