-- Sternebewertung für Qualitätskontrollen
--
-- Die App zeigt beim Qualitätsnachweis jetzt fünf Sterne. Ohne diese Spalte
-- wird die Bewertung beim Speichern stillschweigend weggelassen, der Nachweis
-- selbst funktioniert trotzdem. Mit der Spalte bleibt die Note erhalten.

alter table public.quality_reports
  add column if not exists rating smallint;

-- Kontrolle
select id, work_site_name, rating, created_at
from public.quality_reports
order by created_at desc
limit 10;
