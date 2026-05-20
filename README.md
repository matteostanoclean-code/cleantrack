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
