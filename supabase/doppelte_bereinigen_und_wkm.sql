-- ============================================================
-- Doppelte Kunden und Objekte bereinigen, WKM-Objekt anlegen
-- Stand 23.08.2026
-- ============================================================
--
-- Was hier passiert und warum:
--
-- In der Datenbank stehen fünf Kunden und drei Objekte doppelt. Sie stammen
-- aus der ersten Dateneingabe im Mai, nicht aus dem CSV-Abgleich — der hat
-- jeweils eine der beiden Zeilen erwischt und die andere unberührt gelassen.
-- Deshalb tauchen Bikestore, EUROVIA und WEG Wilhelmstr. 63 zweimal in der
-- NFC-Liste auf.
--
-- Geprüft: Die Paare sind Zeichen für Zeichen gleich, einziger Unterschied ist
-- die Kundennummer, die mal beim einen und mal beim anderen steht.
--
-- ACHTUNG, das ist der Kern: An den Zeilen, die verschwinden sollen, hängen
-- Daten. Fünf Materialartikel, zwei Reinigungspläne, ein Schlüssel und eine
-- Kalkulation. Die werden in Abschnitt 3 zuerst auf die Zeile umgehängt, die
-- bleibt. Ohne diesen Schritt wären sie weg oder ins Leere gelaufen.
--
-- WKM Medizintechnik fehlt in der NFC-Liste, weil der Kunde zwar da ist, aber
-- kein Objekt hat. Die Liste zeigt Objekte, nicht Kunden. Das Objekt liegt
-- laut Kundendatei in der Weberstraße 52 in Eisingen, nicht an der
-- Rechnungsanschrift in Metzingen.
--
-- Abschnitte der Reihe nach ausführen. Abschnitt 1 zuerst, der sichert.

-- ---------- Abschnitt 1: Sicherung ----------
-- Vollständige Kopie beider Tabellen. Solange die steht, ist alles umkehrbar.

drop table if exists sicherung_kunden_0823;
drop table if exists sicherung_objekte_0823;
create table sicherung_kunden_0823 as select * from public.customers;
create table sicherung_objekte_0823 as select * from public.work_sites;

select (select count(*) from sicherung_kunden_0823) as kunden_gesichert,
       (select count(*) from sicherung_objekte_0823) as objekte_gesichert;

-- ---------- Abschnitt 2: Umzugsliste anlegen ----------
-- Links steht, was verschwindet, rechts, wohin es zeigen soll.

drop table if exists umzug_objekte_0823;
drop table if exists umzug_kunden_0823;

create table umzug_objekte_0823 (alt uuid, neu uuid, bezeichnung text);
insert into umzug_objekte_0823 values
  ('14e9e829-b736-408d-9587-8613771a2cf8', '6ea0a36e-6c5a-42dc-86ce-d21f549b45f2', 'Bikestore-KA Gmbh'),
  ('f832b45b-7e82-4053-8a97-4611a58eb318', '8283c7b6-40b4-4cff-8fba-99d1811d8e72', 'EUROVIA Bau GmbH'),
  ('ee75e5ab-a6bd-4868-83ec-450a86a1c349', '5da429da-c1bb-4a8c-bc0e-6eecd96e69ae', 'WEG Wilhelmstr. 63');

create table umzug_kunden_0823 (alt uuid, neu uuid, bezeichnung text);
insert into umzug_kunden_0823 values
  ('084bba74-793f-4b86-b7d6-d1cd1712e586', '63447f8c-cdcd-4a81-8078-7406c13b59dd', 'Bikestore-KA Gmbh'),
  ('ebae6761-6abb-4f77-99c0-72084b7a07ea', '8d941133-60b8-448d-ba08-aa4f25f98a61', 'EUROVIA Bau GmbH'),
  ('b7179c34-eb1a-4fc0-906c-fb86e59e63e0', '9b236ce9-c3b0-4a55-8df6-d5732bbf1253', 'WEG Wilhelmstr. 63'),
  ('a19eb6cb-a18b-4113-9462-8804dd6f015b', 'acd68e6e-1367-4769-8a15-ded795019dc0', 'Adelheid Grund'),
  ('8b425e98-e98b-4484-86cf-e99728525692', 'e804142d-2124-4b9a-910f-f0025b258721', 'RS Hausverwaltung GmbH');

-- Kundennummern retten: bei Adelheid Grund und RS Hausverwaltung steht die
-- Nummer auf der Zeile, die geht.
update public.customers z set customer_number = alt.customer_number
from umzug_kunden_0823 m
join public.customers alt on alt.id = m.alt
where z.id = m.neu
  and coalesce(z.customer_number, '') = ''
  and coalesce(alt.customer_number, '') <> '';

-- ---------- Abschnitt 3: Verweise umhängen ----------
-- Geht jede Tabelle durch, die es gibt, und hängt work_site_id und customer_id
-- um. Tabellen oder Spalten, die es nicht gibt, werden übersprungen.

do $$
declare
  tab text;
begin
  foreach tab in array array[
    'tasks','time_entries','material_products','material_reports','quality_reports',
    'admin_notifications','devices','equipment_items','key_items','cleaning_plans',
    'cleaning_plan_items','calculations','calculation_items','offers','offer_items',
    'customer_contacts','work_sites','push_subscriptions'
  ]
  loop
    if to_regclass('public.' || tab) is null then
      continue;
    end if;

    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = tab and column_name = 'work_site_id') then
      execute format(
        'update public.%I z set work_site_id = m.neu from umzug_objekte_0823 m where z.work_site_id = m.alt', tab);
    end if;

    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = tab and column_name = 'customer_id') then
      execute format(
        'update public.%I z set customer_id = m.neu from umzug_kunden_0823 m where z.customer_id = m.alt', tab);
    end if;
  end loop;
end $$;

-- Kontrolle: sollte überall 0 zeigen, bevor es weitergeht.
select 'material_products' as tabelle, count(*) as haengt_noch_dran from public.material_products where work_site_id in (select alt from umzug_objekte_0823)
union all select 'cleaning_plans', count(*) from public.cleaning_plans where work_site_id in (select alt from umzug_objekte_0823)
union all select 'key_items', count(*) from public.key_items where work_site_id in (select alt from umzug_objekte_0823)
union all select 'calculations', count(*) from public.calculations where work_site_id in (select alt from umzug_objekte_0823)
union all select 'work_sites (kunde)', count(*) from public.work_sites where customer_id in (select alt from umzug_kunden_0823);

-- ---------- Abschnitt 4: Doppelte löschen ----------
-- Erst hier, und erst wenn Abschnitt 3 überall 0 gezeigt hat.

delete from public.work_sites where id in (select alt from umzug_objekte_0823);
delete from public.customers  where id in (select alt from umzug_kunden_0823);

-- ---------- Abschnitt 5: Objekt für WKM anlegen ----------
-- Koordinaten aus OpenStreetMap für Weberstraße 52, 75239 Eisingen.
-- Bitte in der App auf der Karte gegenprüfen, bevor dort jemand stempelt.

insert into public.work_sites
  (name, address, latitude, longitude, allowed_radius_m, active, country,
   customer_id, customer_name, customer_number, notes)
select
  'WKM Medizintechnik Eisingen',
  'Weberstraße 52, 75239, Eisingen',
  48.9403264,
  8.6740550,
  150,
  true,
  'DE Deutschland',
  'da647fb2-4317-466e-82ac-63acf45fedd7',
  'WKM Medizintechnik und Sauerstoff-Therapie GmbH',
  (select customer_number from public.customers where id = 'da647fb2-4317-466e-82ac-63acf45fedd7'),
  'Objektanschrift laut Kundendatei, Rechnung geht nach Metzingen'
where not exists (
  select 1 from public.work_sites
  where customer_id = 'da647fb2-4317-466e-82ac-63acf45fedd7'
);

-- ---------- Abschnitt 6: Alte Push-Anmeldung entfernen ----------
-- Ein Gerät vom 05.05., gespeichert unter dem Namen "Matteo". So heißt kein
-- Profil, der Versand findet die Zeile nie.

delete from public.push_subscriptions where employee_name = 'Matteo';

-- ---------- Abschnitt 7: Kontrolle ----------

select (select count(*) from public.customers) as kunden,
       (select count(*) from public.work_sites) as objekte,
       (select count(*) from public.work_sites where latitude is null) as objekte_ohne_koordinaten,
       (select count(*) from public.material_products) as artikel,
       (select count(*) from public.push_subscriptions) as push_geraete;

-- Sollte keine Zeile mehr liefern:
select name, count(*) from public.work_sites group by name having count(*) > 1;
select name, count(*) from public.customers group by name having count(*) > 1;

-- Die fünf Artikel sollten jetzt am verbliebenen EUROVIA-Objekt hängen:
select p.name, w.name as objekt
from public.material_products p
left join public.work_sites w on w.id = p.work_site_id
order by p.name;

-- ---------- Abschnitt 8: Aufräumen ----------
-- Erst ausführen, wenn oben alles stimmt. Die Sicherung bleibt stehen.

-- drop table umzug_objekte_0823;
-- drop table umzug_kunden_0823;

-- ---------- Abschnitt 9: Notfall, alles zurückholen ----------
-- delete from public.work_sites; insert into public.work_sites select * from sicherung_objekte_0823;
-- delete from public.customers;  insert into public.customers  select * from sicherung_kunden_0823;
