-- ============================================================
-- Doppelte Kunden und Objekte bereinigen, WKM-Objekt anlegen
-- Stand 23.08.2026
-- ============================================================
--
-- Was hier passiert und warum:
--
-- In der Datenbank stehen fünf Kunden und drei Objekte doppelt. Sie stammen
-- aus der ersten Dateneingabe im Mai, nicht aus dem CSV-Abgleich — der hat
-- beim Abgleich jeweils eine der beiden Zeilen erwischt und die andere
-- unberührt gelassen. Deshalb tauchen Bikestore, EUROVIA und
-- WEG Wilhelmstr. 63 zweimal in der NFC-Liste auf.
--
-- Geprüft: Die Zeilen sind Zeichen für Zeichen gleich, einziger Unterschied
-- ist die Kundennummer, die mal beim einen und mal beim anderen steht. Kein
-- einziger Einsatz zeigt auf eine der Zeilen, die hier verschwinden.
--
-- WKM Medizintechnik fehlt in der NFC-Liste, weil der Kunde zwar da ist, aber
-- kein Objekt hat. Die Liste zeigt Objekte, nicht Kunden. Das Objekt liegt
-- laut Kundendatei in der Weberstraße 52 in Eisingen, nicht an der
-- Rechnungsanschrift in Metzingen.
--
-- Abschnittsweise ausführen, jeder Abschnitt einzeln. Abschnitt 1 zuerst,
-- der legt die Sicherung an.

-- ---------- Abschnitt 1: Sicherung ----------
-- Vollständige Kopie beider Tabellen. Solange die stehen bleibt, ist jeder
-- Schritt hier umkehrbar.

drop table if exists sicherung_kunden_0823;
drop table if exists sicherung_objekte_0823;
create table sicherung_kunden_0823 as select * from public.customers;
create table sicherung_objekte_0823 as select * from public.work_sites;

select (select count(*) from sicherung_kunden_0823) as kunden_gesichert,
       (select count(*) from sicherung_objekte_0823) as objekte_gesichert;

-- ---------- Abschnitt 2: Kundennummern retten ----------
-- Bei Adelheid Grund und RS Hausverwaltung hängen die Objekte an der Zeile
-- ohne Kundennummer. Die Nummer wandert herüber, bevor die andere Zeile geht.

update public.customers set customer_number = '10009'
where id = 'acd68e6e-1367-4769-8a15-ded795019dc0' and coalesce(customer_number, '') = '';

update public.customers set customer_number = '10088'
where id = 'e804142d-2124-4b9a-910f-f0025b258721' and coalesce(customer_number, '') = '';

-- ---------- Abschnitt 3: Doppelte Objekte löschen ----------
-- Es bleibt jeweils die Zeile mit der Adresse aus der Kundendatei stehen.

delete from public.work_sites where id in (
  '14e9e829-b736-408d-9587-8613771a2cf8',  -- Bikestore-KA Gmbh, vom 05.05.
  'f832b45b-7e82-4053-8a97-4611a58eb318',  -- EUROVIA Bau GmbH, vom 03.05.
  'ee75e5ab-a6bd-4868-83ec-450a86a1c349'   -- WEG Wilhelmstr. 63, vom 11.05.
);

-- ---------- Abschnitt 4: Doppelte Kunden löschen ----------

delete from public.customers where id in (
  '084bba74-793f-4b86-b7d6-d1cd1712e586',  -- Bikestore-KA Gmbh
  'ebae6761-6abb-4f77-99c0-72084b7a07ea',  -- EUROVIA Bau GmbH
  'b7179c34-eb1a-4fc0-906c-fb86e59e63e0',  -- WEG Wilhelmstr. 63
  'a19eb6cb-a18b-4113-9462-8804dd6f015b',  -- Adelheid Grund, ohne Objekte
  '8b425e98-e98b-4484-86cf-e99728525692'   -- RS Hausverwaltung GmbH, ohne Objekte
);

-- ---------- Abschnitt 5: Objekt für WKM anlegen ----------
-- Koordinaten stammen aus OpenStreetMap für Weberstraße 52, 75239 Eisingen.
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
-- Profil, der Versand findet die Zeile nie. Sie steht nur im Weg.

delete from public.push_subscriptions where employee_name = 'Matteo';

-- ---------- Abschnitt 7: Kontrolle ----------

select (select count(*) from public.customers) as kunden,
       (select count(*) from public.work_sites) as objekte,
       (select count(*) from public.work_sites where latitude is null) as objekte_ohne_koordinaten,
       (select count(*) from public.push_subscriptions) as push_geraete;

-- Sollte keine Zeile mehr liefern:
select name, count(*) from public.work_sites group by name having count(*) > 1;
select name, count(*) from public.customers group by name having count(*) > 1;

-- ---------- Abschnitt 8: Notfall, alles zurückholen ----------
-- delete from public.work_sites; insert into public.work_sites select * from sicherung_objekte_0823;
-- delete from public.customers;  insert into public.customers  select * from sicherung_kunden_0823;
