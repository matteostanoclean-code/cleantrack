-- Einkaufsrechnungen: was wirklich bezahlt wurde, wann.
--
-- Der Anlass: Die Nettopreise beim Lieferanten schwanken. Ein einzelnes Feld
-- "Einkaufspreis" am Artikel kann das nicht abbilden — jede neue Rechnung
-- wuerde ueberschreiben, was vorher galt, und damit auch die Kosten
-- vergangener Monate ruecklaeufig aendern. Eine Auswertung, die sich
-- nachtraeglich von selbst verschiebt, ist keine.
--
-- Deshalb: jede Rechnungszeile bekommt eine eigene Zeile mit ihrem Datum. Der
-- Preis am Artikel bleibt bestehen, ist aber nur noch der zuletzt bekannte
-- Stand fuer neue Bestellungen. Was gerechnet wird, steht in der Bestellzeile
-- und wurde dort beim Bestellen abgeschrieben.
--
-- material_product_id darf leer sein: auf einer Rechnung stehen Positionen,
-- die es im Artikelstamm noch nicht gibt. Lieber die Zeile erfassen und
-- spaeter zuordnen als sie wegzulassen.

create table if not exists material_purchases (
  id                   uuid primary key default gen_random_uuid(),
  material_product_id  uuid,
  article_name         text not null,
  supplier             text,
  invoice_number       text,
  invoice_date         date not null,
  quantity             numeric not null default 1,
  unit_price           numeric not null,
  total_net            numeric,
  unit                 text,
  notes                text,
  created_at           timestamptz not null default now(),
  created_by           text
);

create index if not exists material_purchases_artikel_idx
  on material_purchases (material_product_id, invoice_date desc);
create index if not exists material_purchases_datum_idx
  on material_purchases (invoice_date desc);

comment on table material_purchases is
  'Rechnungszeilen vom Lieferanten. Eine Zeile je Artikel und Rechnung.';
comment on column material_purchases.unit_price is
  'Nettopreis je Einheit auf dieser Rechnung. Nicht der aktuelle Preis, sondern der damalige.';
comment on column material_purchases.material_product_id is
  'Zuordnung zum Artikelstamm. Leer heisst: Position noch nicht zugeordnet.';

alter table public.material_products
  add column if not exists price_updated_at date;

comment on column public.material_products.price_updated_at is
  'Wann der Einkaufspreis zuletzt aus einer Rechnung nachgezogen wurde.';
