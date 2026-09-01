-- ============================================================
-- Objekte, Inventar und Abrechnung
-- Stand 01.09.2026
-- ============================================================
--
-- Vier Dinge:
--
-- 1. Objekte bekommen eine Nummer, einen Objektleiter, Tags und die
--    Abrechnungsgrundlage. Die Tags sagen, was dort gemacht wird —
--    Unterhaltsreinigung, Glasreinigung und so weiter.
--
-- 2. Abrechnung je Objekt: entweder eine monatliche Pauschale netto oder ein
--    Stundensatz. Beides zusammen geht auch, dann gilt die Pauschale und die
--    Stunden darüber werden nachberechnet. Wo nichts steht, bleibt die
--    Auswertung leer statt eine Zahl zu erfinden.
--
-- 3. Geräte werden zur Inventarliste für die Bilanz. Dafür fehlten:
--    Anschaffungspreis, Hersteller, Modell, Lieferant, Rechnungsnummer,
--    Nutzungsdauer und der Abgang. Damit lässt sich der Restbuchwert linear
--    rechnen, und das ist es, was der Steuerberater sehen will.
--
-- 4. Geräte und Schlüssel hängen am Objekt. Was keinen Kunden hat, wandert
--    auf das eigene Objekt.
--
-- Einmal im SQL-Editor von Supabase ausführen. Läuft auch mehrfach ohne
-- Schaden.

-- ---------- Abschnitt 1: Objekte ----------

alter table public.work_sites
  add column if not exists object_number integer,
  add column if not exists object_manager text,
  add column if not exists tags text,
  add column if not exists status text default 'aktiv',
  add column if not exists monthly_flat_rate numeric,
  add column if not exists hourly_rate numeric,
  add column if not exists rating numeric,
  add column if not exists address_addition text;

comment on column public.work_sites.tags is
  'Was an diesem Objekt gemacht wird, mit Komma getrennt: Unterhaltsreinigung, Glasreinigung, Treppenhausreinigung, Gartenarbeiten, Bauendreinigung, Wohnungsreinigung.';
comment on column public.work_sites.monthly_flat_rate is
  'Monatliche Pauschale netto in Euro. Leer heisst: es wird nach Stunden abgerechnet.';
comment on column public.work_sites.hourly_rate is
  'Stundensatz netto in Euro. Gilt ohne Pauschale fuer alles, mit Pauschale fuer die Stunden darueber.';

-- Objekte durchnummerieren, aelteste zuerst.
with nummeriert as (
  select id, row_number() over (order by created_at nulls last, name) as nr
  from public.work_sites
  where object_number is null
)
update public.work_sites w
set object_number = n.nr
from nummeriert n
where w.id = n.id;

update public.work_sites set status = case when active = false then 'passiv' else 'aktiv' end
where status is null;

-- ---------- Abschnitt 2: Geraete als Inventar ----------

alter table public.devices
  add column if not exists manufacturer text,
  add column if not exists model text,
  add column if not exists purchase_price numeric,
  add column if not exists supplier text,
  add column if not exists invoice_number text,
  add column if not exists useful_life_years integer,
  add column if not exists disposed_at date,
  add column if not exists disposal_note text,
  add column if not exists nfc_tag_id text,
  add column if not exists assigned_to text,
  add column if not exists next_service_date date;

comment on column public.devices.purchase_price is
  'Anschaffungspreis netto in Euro. Grundlage fuer den Restbuchwert.';
comment on column public.devices.useful_life_years is
  'Betriebsgewoehnliche Nutzungsdauer in Jahren fuer die lineare Abschreibung.';
comment on column public.devices.disposed_at is
  'Datum des Abgangs: verkauft, verschrottet oder gestohlen. Danach zaehlt das Geraet nicht mehr zum Inventar.';
comment on column public.devices.nfc_tag_id is
  'Kennung des NFC-Aufklebers am Geraet.';

-- ---------- Abschnitt 3: Schluessel ----------

alter table public.key_items
  add column if not exists key_identifier text,
  add column if not exists key_count integer default 1;

comment on column public.key_items.key_identifier is
  'Schluesselkennung, also die Praegung auf dem Schluessel.';

-- ---------- Abschnitt 4: Ohne Kunden aufs eigene Objekt ----------
-- Geraete und Schluessel ohne Objekt gehoeren ins eigene Lager. Solange es
-- kein eigenes Objekt gibt, passiert hier nichts.

do $$
declare
  eigenes uuid;
  eigenerName text;
begin
  select id, name into eigenes, eigenerName
  from public.work_sites
  where name ilike '%Matteo Stano Clean%'
  order by created_at
  limit 1;

  if eigenes is null then
    raise notice 'Kein eigenes Objekt gefunden. Lege ein Objekt mit "Matteo Stano Clean" im Namen an und fuehre das Skript erneut aus.';
    return;
  end if;

  update public.devices
  set work_site_id = eigenes, work_site_name = eigenerName
  where work_site_id is null;

  update public.key_items
  set work_site_id = eigenes, object_name = eigenerName
  where work_site_id is null;

  raise notice 'Geraete und Schluessel ohne Objekt wurden auf % gebucht.', eigenerName;
end $$;

-- ---------- Kontrolle ----------

select count(*) as objekte, count(object_number) as mit_nummer,
       count(*) filter (where coalesce(monthly_flat_rate, 0) > 0) as mit_pauschale,
       count(*) filter (where coalesce(hourly_rate, 0) > 0) as mit_stundensatz
from public.work_sites;

select count(*) as geraete,
       count(*) filter (where work_site_id is null) as ohne_objekt,
       count(purchase_price) as mit_preis
from public.devices;

select count(*) as schluessel, count(*) filter (where work_site_id is null) as ohne_objekt
from public.key_items;
