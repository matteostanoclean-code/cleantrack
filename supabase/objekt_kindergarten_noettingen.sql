-- ============================================================
-- Zweites Objekt der Evang. Kirchengemeinde Remchingen
-- Stand 27.08.2026
-- ============================================================
--
-- Die Kirchengemeinde hat zwei Objekte. St. Martin in der Karlsbader Str. 21
-- steht schon drin, der Kindergarten fehlte noch.
--
-- Koordinaten aus OpenStreetMap. Dort ist das Gebäude sogar namentlich
-- eingetragen: "Evangelischer Kindergarten Nöttingen, Roseggerstraße 8".
-- Trotzdem in der App einmal auf der Karte gegenprüfen, bevor dort jemand
-- stempelt — 150 Meter Radius sind schnell daneben.
--
-- Einmal im SQL-Editor von Supabase ausführen. Läuft auch mehrfach ohne
-- Schaden, das Objekt wird nicht doppelt angelegt.

insert into public.work_sites
  (name, address, latitude, longitude, allowed_radius_m, active, country,
   customer_id, customer_name, notes)
select
  'Evangelischer Kindergarten Nöttingen',
  'Roseggerstr. 8, 75196, Remchingen-Nöttingen',
  48.9301320,
  8.5677922,
  150,
  true,
  'DE Deutschland',
  '20a7de5b-bc67-412d-9b28-aab29cd1634f',
  'Evang. Kirchengemeinde Remchingen',
  'Zweites Objekt der Kirchengemeinde. Rechnung geht an Im Grund 3, 75196 Remchingen.'
where not exists (
  select 1 from public.work_sites
  where customer_id = '20a7de5b-bc67-412d-9b28-aab29cd1634f'
    and name = 'Evangelischer Kindergarten Nöttingen'
);

-- Kontrolle: sollte beide Objekte der Kirchengemeinde zeigen.
select name, address, latitude, longitude, allowed_radius_m
from public.work_sites
where customer_id = '20a7de5b-bc67-412d-9b28-aab29cd1634f'
order by name;

-- Und die Gesamtzahl, danach sollten es 28 Objekte sein.
select count(*) as objekte from public.work_sites;
