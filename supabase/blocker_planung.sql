-- ============================================================
-- Planung über Blocker statt fester Uhrzeiten
-- Stand 01.09.2026
-- ============================================================
--
-- Bisher brauchte jeder Einsatz ein Zeitfenster: Mi 17:00 bis 19:00. In der
-- Unterhaltsreinigung ist das eine Angabe, die niemand einhält und die dann
-- als Abweichung gemeldet wird, obwohl die Dauer stimmt. Wer 17:15 anfängt
-- und 19:15 aufhört, hat seine zwei Stunden gemacht.
--
-- Neu ist deshalb: Ein Blocker sagt, WER an welchem TAG an welchem OBJEKT ist
-- und WIE LANGE. Wann genau, entscheidet die Stempeluhr am Objekt.
--
-- Zwei Dinge dafür:
--
-- 1. planned_minutes wird die führende Angabe. Wo sie fehlt, wird sie aus dem
--    bisherigen Zeitfenster nachgetragen, damit kein Einsatz ohne Vorgabe
--    dasteht.
--
-- 2. start_time und end_time bleiben, bekommen aber eine neue Bedeutung: ein
--    freiwilliges Zeitfenster ("frühestens / spätestens"). Ob es eingehalten
--    werden muss, sagt window_binding. Bei allen vorhandenen Einsätzen steht
--    das auf false — sonst würden 200 alte Termine ab morgen als
--    Fensterverstoss gemeldet, nur weil jemand eine Viertelstunde später kam.
--
-- Einmal im SQL-Editor von Supabase ausführen. Läuft auch mehrfach ohne
-- Schaden.

alter table public.tasks
  add column if not exists window_binding boolean default false;

comment on column public.tasks.window_binding is
  'true: das Zeitfenster aus start_time/end_time soll eingehalten werden. false: die Zeiten sind nur ein Hinweis, es zaehlt die Dauer aus planned_minutes.';
comment on column public.tasks.planned_minutes is
  'Zeitvorgabe in Minuten. Fuehrende Angabe fuer Soll-Zeit, Abweichung und Lohn.';

-- Vorgabe aus dem bisherigen Zeitfenster nachtragen, wo sie fehlt.
update public.tasks
set planned_minutes = case
    when start_time is null or end_time is null then null
    when end_time >= start_time
      then extract(epoch from (end_time::time - start_time::time)) / 60
      else 1440 + extract(epoch from (end_time::time - start_time::time)) / 60
  end
where coalesce(planned_minutes, 0) <= 0
  and start_time is not null
  and end_time is not null;

-- Vorhandene Einsaetze behalten ihr Fenster als reinen Hinweis.
update public.tasks set window_binding = false where window_binding is null;

-- ---------- Kontrolle ----------

select
  count(*) as einsaetze,
  count(*) filter (where coalesce(planned_minutes, 0) > 0) as mit_vorgabe,
  count(*) filter (where coalesce(planned_minutes, 0) <= 0) as ohne_vorgabe,
  count(*) filter (where window_binding) as mit_bindendem_fenster
from public.tasks;

-- Diese Einsaetze haben weder Vorgabe noch Zeitfenster und brauchen eine
-- Zeitvorgabe von Hand:
select id, task_date, employee_name, site, title
from public.tasks
where coalesce(planned_minutes, 0) <= 0
order by task_date desc
limit 50;
