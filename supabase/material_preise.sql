-- Material mit Preis: was der Einkauf kostet und was davon der Kunde zahlt.
--
-- Der Anlass: Bei manchen Kunden wird Toiletten- und Handpapier gekauft, ohne
-- es weiterzuberechnen. Das ist bare Kosten am Objekt, taucht aber nirgends
-- auf. Bei anderen wird dieselbe Ware in Rechnung gestellt. Ob das eine oder
-- das andere gilt, haengt am Objekt, nicht am Artikel im Allgemeinen.
--
-- Das passt hier zusammen, weil ein Artikel ohnehin schon zu einem Objekt
-- gehoert: "Toilettenpapier bei EUROVIA" ist eine eigene Zeile, nicht
-- dieselbe wie "Toilettenpapier beim Testobjekt". Der Schalter kann deshalb
-- am Artikel haengen.
--
-- Die Preise werden bei jeder Bestellung in die Zeile kopiert. Steigt der
-- Einkaufspreis im Dezember, darf die Novemberrechnung sich nicht
-- rueckwirkend aendern.

alter table public.material_products
  add column if not exists purchase_price numeric,
  add column if not exists sale_price      numeric,
  add column if not exists billable        boolean default false;

comment on column public.material_products.purchase_price is
  'Einkaufspreis netto je Einheit. Grundlage der Materialkosten am Objekt.';
comment on column public.material_products.sale_price is
  'Verkaufspreis netto je Einheit. Nur bedeutsam, wenn billable gesetzt ist.';
comment on column public.material_products.billable is
  'Wird dem Kunden weiterberechnet. Aus heisst: reine Kosten am Objekt.';

alter table public.material_reports
  add column if not exists unit_price      numeric,
  add column if not exists sale_unit_price numeric,
  add column if not exists billable        boolean;

comment on column public.material_reports.unit_price is
  'Einkaufspreis zum Zeitpunkt der Bestellung. Abschrift, kein Verweis.';
comment on column public.material_reports.sale_unit_price is
  'Verkaufspreis zum Zeitpunkt der Bestellung.';
comment on column public.material_reports.billable is
  'Ob diese Zeile weiterberechnet wird. Kommt vom Artikel, kann abweichen.';

-- Was noch keinen Wert hat, gilt als nicht weiterberechnet. Das ist die
-- vorsichtige Annahme: lieber Kosten zu viel zeigen als Erloes zu viel.
update public.material_products set billable = false where billable is null;
update public.material_reports  set billable = false where billable is null;
