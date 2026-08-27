-- ============================================================
-- Urlaub: gutgeschriebene Stunden festhalten
-- Stand 27.08.2026
-- ============================================================
--
-- Wird ein Urlaub genehmigt, rechnet die App aus, wie viele Stunden dem
-- Mitarbeiter für die Tage gutzuschreiben sind:
--
--   1. Steht für den Tag noch ein Einsatz auf ihn, zählt dessen Planzeit.
--   2. Sonst wird aus den letzten acht Wochen der gleiche Wochentag genommen.
--      Wer montags immer zwei Stunden macht, bekommt für einen Urlaubsmontag
--      zwei Stunden.
--   3. Findet sich nichts, bleibt der Tag bei null. Lieber nichts als eine
--      erfundene Zahl in der Lohnabrechnung.
--
-- Ohne diese Spalten kann das Ergebnis nicht gespeichert werden. Die
-- Genehmigung läuft trotzdem durch, nur die Stunden fehlen dann.
--
-- Einmal im SQL-Editor von Supabase ausführen. Läuft auch mehrfach ohne
-- Schaden.

alter table public.absence_requests
  add column if not exists credited_minutes integer,
  add column if not exists credited_days integer,
  add column if not exists credit_detail jsonb;

comment on column public.absence_requests.credited_minutes is
  'Gutgeschriebene Minuten für den gesamten Zeitraum, berechnet bei der Genehmigung.';
comment on column public.absence_requests.credited_days is
  'Anzahl Tage mit Gutschrift, also ohne freie Tage im Zeitraum.';
comment on column public.absence_requests.credit_detail is
  'Je Tag: Minuten und woher die Zahl kommt (einsatz, muster, keine).';

-- Kontrolle: sollte die drei Spalten zeigen.
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'absence_requests'
  and column_name in ('credited_minutes', 'credited_days', 'credit_detail')
order by column_name;

-- Bereits genehmigte Abwesenheiten haben noch keine Gutschrift. Sie bekommen
-- eine, sobald sie einmal neu genehmigt werden. Alternativ hier nachsehen,
-- welche betroffen sind:
-- select id, employee_name, start_date, end_date, status
-- from public.absence_requests
-- where status = 'approved' and credited_minutes is null
-- order by start_date desc;
