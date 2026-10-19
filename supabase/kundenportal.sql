-- Kundenportal: der Kunde sieht, wann wir da waren, und kann reklamieren.
--
-- Zugang ueber einen geheimen Link je Kunde, wie bei den NFC-Aufklebern. Kein
-- Konto, kein Passwort, nichts zu verwalten. Wer den Link hat, kommt rein --
-- deshalb ist er lang und nicht zu erraten, und er laesst sich jederzeit
-- ungueltig machen und neu erzeugen.
--
-- Der Link steht am Kunden, nicht am Objekt: ein Kunde mit zwei Objekten
-- (MG Nobel und Carl, Remchingen) sieht beide unter einem Link.

alter table public.customers
  add column if not exists portal_token      text,
  add column if not exists portal_aktiv      boolean default false,
  add column if not exists portal_erstellt_at timestamptz;

create unique index if not exists customers_portal_token_idx
  on public.customers (portal_token)
  where portal_token is not null;

comment on column public.customers.portal_token is
  'Geheimer Teil der Portal-Adresse. Neu erzeugen macht den alten Link sofort ungueltig.';
comment on column public.customers.portal_aktiv is
  'false: der Link fuehrt ins Leere, auch wenn ihn jemand noch hat.';

-- Reklamationen aus dem Portal landen als normaler Vorgang in den Aufgaben,
-- mit Kuerzel REKL. Zwei Dinge fehlen dafuer: die Bilder und die Herkunft.
alter table public.tickets
  add column if not exists photo_urls text[] default '{}',
  add column if not exists quelle     text;

comment on column public.tickets.photo_urls is
  'Bilder zur Reklamation, zum Beispiel vom Kunden aus dem Portal.';
comment on column public.tickets.quelle is
  'Woher der Vorgang kommt: kunde, buero, app. Leer heisst buero.';
