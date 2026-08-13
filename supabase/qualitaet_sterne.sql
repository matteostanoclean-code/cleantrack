-- Sternebewertung für Qualitätskontrollen
--
-- Die App zeigt beim Qualitätsnachweis fünf Sterne. Ohne diese Spalte wird die
-- Bewertung beim Speichern stillschweigend weggelassen, der Nachweis selbst
-- funktioniert trotzdem. Mit der Spalte bleibt die Note erhalten.
--
-- Hinweis: In der ersten Fassung stand hier eine Kontrollabfrage auf
-- work_site_name. Diese Spalte gibt es in quality_reports nicht, sie heißt
-- site. Der Fehler hat das ganze Skript zurückgerollt, also auch das
-- alter table. Diese Fassung ist korrigiert.

alter table public.quality_reports
  add column if not exists rating smallint;

-- Kontrolle
select id, site, rating, status, created_at
from public.quality_reports
order by created_at desc
limit 10;
