-- ============================================================
-- Einsatz-Erinnerungen aktivieren (Push 60 und 15 Minuten vorher)
-- ============================================================
--
-- Warum hier und nicht in Vercel:
-- Der Vercel-Hobby-Tarif erlaubt nur Cron-Aufgaben, die EINMAL AM TAG laufen.
-- Erinnerungen 60 und 15 Minuten vor Arbeitsbeginn brauchen aber einen Lauf
-- alle 15 Minuten. Genau daran ist es am 24.05.2026 schon einmal gescheitert
-- (Commit "Fix Vercel hobby cron schedule", danach wurde der Eintrag entfernt).
--
-- Supabase kann das ohne Zusatzkosten: die Datenbank ruft den Endpunkt selbst
-- alle 15 Minuten auf. Kein fremder Dienst, keine Daten ausser Haus.
--
-- ------------------------------------------------------------
-- VORHER ERLEDIGEN, sonst laeuft es ins Leere:
--
-- 1. Deployment-Schutz abschalten
--    Vercel -> Projekt cleantrack -> Settings -> Deployment Protection
--    -> Vercel Authentication auf "Only Preview Deployments" stellen.
--    Aktuell antwortet die Produktiv-Adresse mit einer Vercel-Anmeldeseite.
--    Solange das so ist, kommt weder der Cron noch dein Team in die App.
--
-- 2. CRON_SECRET setzen
--    Vercel -> Settings -> Environment Variables -> CRON_SECRET
--    Irgendein langes zufaelliges Wort. Danach einmal neu deployen.
--    Ohne dieses Geheimnis koennte jeder den Endpunkt aufrufen.
--
-- 3. Unten HIER_DEIN_CRON_SECRET durch dasselbe Geheimnis ersetzen,
--    das in Vercel unter CRON_SECRET steht.
--    Die Adresse cleantrack-xi.vercel.app ist bereits eingetragen.
-- ------------------------------------------------------------


-- ---------- Schritt 1: Erweiterungen einschalten ----------
create extension if not exists pg_cron;
create extension if not exists pg_net;


-- ---------- Schritt 2: Aufgabe einrichten ----------
-- Laeuft alle 15 Minuten. Der Endpunkt selbst prueft, wer wirklich eine
-- Erinnerung braucht, und verschickt jede nur einmal.
select cron.schedule(
  'schichtklar-einsatz-erinnerungen',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://cleantrack-xi.vercel.app/api/cron/task-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer HIER_DEIN_CRON_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);


-- ---------- Schritt 3: Kontrolle ----------
-- Ist die Aufgabe eingetragen?
select jobid, jobname, schedule, active from cron.job;

-- Was ist bei den letzten Laeufen passiert? (ein paar Minuten warten)
select jobid, status, return_message, start_time
from cron.job_run_details
order by start_time desc
limit 10;

-- Was hat der Endpunkt geantwortet?
select id, status_code, content, created
from net._http_response
order by created desc
limit 10;
-- Erwartet: status_code 200 und eine Antwort wie
-- {"ok":true,"today":"...","checked":3,"sent":1,...}
-- Kommt stattdessen HTML mit "Login", ist der Deployment-Schutz noch an.


-- ---------- Bei Bedarf: wieder abschalten ----------
-- select cron.unschedule('schichtklar-einsatz-erinnerungen');
