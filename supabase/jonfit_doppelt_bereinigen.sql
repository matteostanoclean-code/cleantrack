-- ============================================================
-- JonFit GmbH steht zweimal in der Objektliste
-- Angelegt am 15.10.2026, noch nicht ausgeführt
-- ============================================================
--
-- In der NFC-Liste taucht JonFit GmbH zweimal auf, beide Male mit derselben
-- Anschrift Hertzstraße 7 in 76307 Karlsbad-Langensteinbach und 150 m Radius.
-- Einziger sichtbarer Unterschied ist ein Komma hinter der Postleitzahl. Das
-- sieht nach demselben Muster aus wie bei Bikestore, EUROVIA und WEG
-- Wilhelmstr. 63 im August: zwei Dateneingaben, zwei Zeilen.
--
--   872e39e3-ffd5-4948-993d-a1997d29ebb0
--   1e5b5065-1d7b-477b-9a5b-0ece5c32f1a1
--
-- Weg soll die Zeile, für die es keine Termine gibt.
--
-- WICHTIG, zwei Dinge:
--
-- 1. Welche der beiden das ist, entscheidet das Skript selbst anhand der
--    Einsätze. Es steht hier bewusst keine ID fest verdrahtet. Wenn an
--    beiden Zeilen Einsätze hängen oder an keiner, bricht es ab und ändert
--    nichts.
--
-- 2. An der Zeile, die geht, können trotzdem Dinge hängen, die keine
--    Einsätze sind: Materialartikel, ein Reinigungsplan, ein Schlüssel,
--    eine Kalkulation. Abschnitt 4 hängt sie zuerst um. Ohne diesen Schritt
--    wären sie weg.
--
-- Abschnitte der Reihe nach ausführen. Abschnitt 1 zuerst, der sichert.

-- ---------- Abschnitt 1: Sicherung ----------
-- Solange die Tabelle steht, ist alles umkehrbar.

drop table if exists sicherung_objekte_1015;
create table sicherung_objekte_1015 as select * from public.work_sites;

select count(*) as objekte_gesichert from sicherung_objekte_1015;

-- ---------- Abschnitt 2: Ansehen, was dranhängt ----------
-- Erst lesen, dann löschen. Diese Abfrage ändert nichts.

select w.id,
       w.name,
       w.address,
       w.created_at,
       (select count(*) from public.tasks             t where t.work_site_id = w.id) as einsaetze,
       (select count(*) from public.time_entries      z where z.work_site_id = w.id) as zeitstempel,
       (select count(*) from public.material_products m where m.work_site_id = w.id) as artikel,
       (select count(*) from public.cleaning_plans    p where p.work_site_id = w.id) as reinigungsplaene,
       (select count(*) from public.quality_reports   q where q.work_site_id = w.id) as nachweise
from public.work_sites w
where w.id in ('872e39e3-ffd5-4948-993d-a1997d29ebb0',
               '1e5b5065-1d7b-477b-9a5b-0ece5c32f1a1')
order by einsaetze desc;

-- ---------- Abschnitt 3: Entscheiden, welche bleibt ----------
-- Es bleibt die Zeile mit Einsätzen. Gibt es bei beiden welche oder bei
-- keiner, wird abgebrochen: dann ist es keine saubere Doppelung und
-- gehört von Hand angesehen.

drop table if exists umzug_jonfit_1015;
create table umzug_jonfit_1015 (alt uuid, neu uuid, bezeichnung text);

do $$
declare
  a uuid := '872e39e3-ffd5-4948-993d-a1997d29ebb0';
  b uuid := '1e5b5065-1d7b-477b-9a5b-0ece5c32f1a1';
  a_termine int;
  b_termine int;
  bleibt uuid;
  geht uuid;
begin
  select count(*) into a_termine from public.tasks where work_site_id = a;
  select count(*) into b_termine from public.tasks where work_site_id = b;

  if a_termine > 0 and b_termine > 0 then
    raise exception 'Abbruch: an beiden Zeilen hängen Einsätze (% und %). Bitte von Hand ansehen.',
      a_termine, b_termine;
  end if;

  if a_termine = 0 and b_termine = 0 then
    raise exception 'Abbruch: an keiner der beiden Zeilen hängen Einsätze. Dann ist unklar, welche gemeint ist.';
  end if;

  if a_termine > 0 then
    bleibt := a; geht := b;
  else
    bleibt := b; geht := a;
  end if;

  insert into umzug_jonfit_1015 values (geht, bleibt, 'JonFit GmbH');
  raise notice 'Es bleibt %, es geht %.', bleibt, geht;
end $$;

select * from umzug_jonfit_1015;

-- ---------- Abschnitt 4: Verweise umhängen ----------
-- Geht jede Tabelle durch, die es gibt. Tabellen oder Spalten, die es nicht
-- gibt, werden übersprungen. Gleiche Liste wie bei der Bereinigung im August.

do $$
declare
  tab text;
begin
  foreach tab in array array[
    'tasks','time_entries','material_products','material_reports','quality_reports',
    'admin_notifications','devices','equipment_items','key_items','cleaning_plans',
    'cleaning_plan_items','calculations','calculation_items','offers','offer_items',
    'customer_contacts','employee_work_sites','push_subscriptions'
  ]
  loop
    if to_regclass('public.' || tab) is null then
      continue;
    end if;

    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = tab and column_name = 'work_site_id') then
      execute format(
        'update public.%I z set work_site_id = m.neu from umzug_jonfit_1015 m where z.work_site_id = m.alt', tab);
    end if;
  end loop;
end $$;

-- Kontrolle: muss überall 0 zeigen, bevor es weitergeht.
select 'tasks' as tabelle, count(*) as haengt_noch_dran from public.tasks where work_site_id in (select alt from umzug_jonfit_1015)
union all select 'time_entries',      count(*) from public.time_entries      where work_site_id in (select alt from umzug_jonfit_1015)
union all select 'material_products', count(*) from public.material_products where work_site_id in (select alt from umzug_jonfit_1015)
union all select 'cleaning_plans',    count(*) from public.cleaning_plans    where work_site_id in (select alt from umzug_jonfit_1015)
union all select 'quality_reports',   count(*) from public.quality_reports   where work_site_id in (select alt from umzug_jonfit_1015);

-- ---------- Abschnitt 5: Doppelte löschen ----------
-- Erst hier, und erst wenn Abschnitt 4 überall 0 gezeigt hat.

delete from public.work_sites where id in (select alt from umzug_jonfit_1015);

-- ---------- Abschnitt 6: Kontrolle ----------

select count(*) as objekte_gesamt from public.work_sites;

-- Sollte keine Zeile mehr liefern:
select name, count(*) from public.work_sites group by name having count(*) > 1;

-- Die verbliebene JonFit-Zeile mit allem, was dranhängt:
select w.id, w.name, w.address,
       (select count(*) from public.tasks t where t.work_site_id = w.id) as einsaetze,
       (select count(*) from public.cleaning_plans p where p.work_site_id = w.id) as reinigungsplaene
from public.work_sites w
where w.name ilike '%jonfit%';

-- ---------- Abschnitt 7: Aufräumen ----------
-- Erst ausführen, wenn oben alles stimmt. Die Sicherung bleibt stehen.

-- drop table umzug_jonfit_1015;

-- ---------- Abschnitt 8: Notfall, alles zurückholen ----------
-- delete from public.work_sites;
-- insert into public.work_sites select * from sicherung_objekte_1015;

-- ---------- Danach ----------
-- Der NFC-Aufkleber am Objekt zeigt auf eine der beiden Kennungen. Zeigt er
-- auf die gelöschte, läuft er ins Leere. Nach dem Lauf in der NFC-Liste die
-- verbliebene Adresse ablesen und den Chip neu beschreiben.
