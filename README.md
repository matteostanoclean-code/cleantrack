# CleanTrack Pro Mobile App

Diese Version ist eine Vercel-fertige Next.js-App mit einem mobilen Dark-Layout nach dem Google-AI-Studio-Screenshot.

## Start lokal

```bash
npm install
npm run dev
```

## Build für Vercel

```bash
npm run build
```

## Routen

- `/` Startseite
- `/mitarbeiter` Mobile App
- `/mitarbeiter/schedule` Einsatzplan
- `/mitarbeiter/clock` Stempeluhr
- `/mitarbeiter/timesheet` Stundenzettel
- `/mitarbeiter/tasks` Aufgaben

## Hinweis

Diese Version funktioniert sofort als Frontend-App. Die Stempeluhr speichert Test-Zeiten im Browser per `localStorage`.
Supabase/Login/Admin kann im nächsten Schritt wieder sauber angebunden werden.
