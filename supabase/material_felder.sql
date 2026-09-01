-- ============================================================
-- Materialwesen: Artikelnummern und Bestellungen
-- Stand 01.09.2026
-- ============================================================
--
-- Zwei Dinge:
--
-- 1. Artikel bekommen eine eigene Nummer. Die zaehlt fortlaufend hoch und ist
--    das, worueber im Betrieb geredet wird ("Nummer 14"). Dazu die externe
--    Nummer des Lieferanten, damit die Bestellung beim Haendler zugeordnet
--    werden kann.
--
-- 2. Bestellungen bekommen einen Kopf. Bisher stand jede Zeile fuer sich in
--    material_reports und wurde ueber Zeitpunkt und Objekt wieder
--    zusammengesucht. Das haelt, solange niemand zweimal in derselben Minute
--    bestellt. Mit einer Nummer je Bestellung ist es eindeutig.
--
-- Einmal im SQL-Editor von Supabase ausfuehren. Laeuft auch mehrfach ohne
-- Schaden.

-- ---------- Abschnitt 1: Artikel ----------

alter table public.material_products
  add column if not exists article_number integer,
  add column if not exists external_number text,
  add column if not exists description text,
  add column if not exists active boolean default true;

-- Vorhandene Artikel durchnummerieren, aeltester zuerst.
with nummeriert as (
  select id, row_number() over (order by created_at nulls last, name) as nr
  from public.material_products
  where article_number is null
)
update public.material_products p
set article_number = n.nr
from nummeriert n
where p.id = n.id;

create index if not exists material_products_number_idx on public.material_products (article_number);

comment on column public.material_products.article_number is
  'Fortlaufende Hausnummer des Artikels. Wird beim Anlegen vergeben.';
comment on column public.material_products.external_number is
  'Bestellnummer beim Lieferanten.';

-- ---------- Abschnitt 2: Bestellungen ----------

alter table public.material_reports
  add column if not exists order_number integer,
  add column if not exists order_group uuid,
  add column if not exists supplier text,
  add column if not exists ordered_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists billed_at timestamptz;

-- Bestehende Zeilen zu Bestellungen zusammenfassen: gleiche Minute, gleiches
-- Objekt, gleiche Person gehoeren zusammen.
with gruppen as (
  select
    coalesce(object_name, site, '') as objekt,
    coalesce(employee_name, '') as person,
    date_trunc('minute', created_at) as minute,
    gen_random_uuid() as gruppe,
    row_number() over (order by date_trunc('minute', min(created_at))) as nr
  from public.material_reports
  where order_group is null
  group by 1, 2, 3
)
update public.material_reports r
set order_group = g.gruppe, order_number = g.nr
from gruppen g
where r.order_group is null
  and coalesce(r.object_name, r.site, '') = g.objekt
  and coalesce(r.employee_name, '') = g.person
  and date_trunc('minute', r.created_at) = g.minute;

create index if not exists material_reports_group_idx on public.material_reports (order_group);

comment on column public.material_reports.order_group is
  'Alle Zeilen einer Bestellung teilen diese Nummer.';
comment on column public.material_reports.order_number is
  'Laufende Nummer der Bestellung, das ist die ID in der Liste.';

-- ---------- Kontrolle ----------

select count(*) as artikel, count(article_number) as mit_nummer
from public.material_products;

select count(*) as bestellzeilen, count(distinct order_group) as bestellungen
from public.material_reports;
