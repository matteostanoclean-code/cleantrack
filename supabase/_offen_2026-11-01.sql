-- ============================================================
-- Was in der Datenbank noch fehlt, Stand 01.11.2026
-- ============================================================
--
-- Drei Dinge auf einmal, damit es ein Durchgang ist statt drei. Alles
-- laeuft auch mehrfach ohne Schaden: nichts wird geloescht, nichts
-- ueberschrieben, jede Zeile prueft vorher, ob es sie schon gibt.
--
-- Im SQL-Editor von Supabase einfuegen und auf Run.
--
--   1. Kundenurlaub      -- der Urlaubsplaner und "Kunde hat zu" am Objekt
--   2. Kundenportal      -- der Link je Kunde und Reklamationen mit Bild
--   3. Push-Anmeldungen  -- Push ans Profil statt an den geschriebenen Namen
--
-- Die Einzeldateien bleiben daneben liegen: kundenurlaub.sql,
-- kundenportal.sql, push_subscriptions_profil_id.sql.


-- ------------------------------------------------------------
-- 1. Kundenurlaub: wenn beim Kunden zu ist.
-- ------------------------------------------------------------
-- Betriebsferien beim Kunden sind der beste Zeitraum fuer den Urlaub der
-- eigenen Leute. Eine eigene Tabelle und nicht absence_requests: ein
-- Mitarbeiter hat einen Anspruch, eine Fortzahlung und eine Genehmigung.
-- Ein geschlossenes Objekt hat nichts davon, es ist einfach zu.

create table if not exists site_closures (
  id            uuid primary key default gen_random_uuid(),
  work_site_id  uuid,
  object_name   text,
  customer_name text,
  von           date not null,
  bis           date not null,
  grund         text,
  -- Faellt die Reinigung wirklich aus, oder ist nur eingeschraenkt auf?
  -- Bei "false" bleibt der Einsatz stehen und ist nur ein Hinweis.
  faellt_aus    boolean not null default true,
  notiz         text,
  created_at    timestamptz not null default now(),
  created_by    text
);

create index if not exists site_closures_zeitraum_idx on site_closures (von, bis);
create index if not exists site_closures_objekt_idx on site_closures (work_site_id, von);

comment on table site_closures is
  'Zeitraeume, in denen bei einem Kunden geschlossen ist. Grundlage fuer die Urlaubsplanung.';
comment on column site_closures.faellt_aus is
  'true: in dieser Zeit wird dort nicht gereinigt. false: nur ein Hinweis, der Einsatz bleibt.';


-- ------------------------------------------------------------
-- 2. Kundenportal: der Kunde sieht, wann wir da waren.
-- ------------------------------------------------------------
-- Zugang ueber einen geheimen Link je Kunde, wie bei den NFC-Aufklebern.
-- Kein Konto, kein Passwort. Der Link steht am Kunden, nicht am Objekt:
-- ein Kunde mit zwei Objekten sieht beide unter einem Link.

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

-- Reklamationen aus dem Portal landen als normaler Vorgang in den Aufgaben.
alter table public.tickets
  add column if not exists photo_urls text[] default '{}',
  add column if not exists quelle     text;

comment on column public.tickets.photo_urls is
  'Bilder zur Reklamation, zum Beispiel vom Kunden aus dem Portal.';
comment on column public.tickets.quelle is
  'Woher der Vorgang kommt: kunde, buero, app. Leer heisst buero.';


-- ------------------------------------------------------------
-- 3. Push-Anmeldungen: an das Profil statt an den Namen.
-- ------------------------------------------------------------
-- Ohne diese Spalte haengt die Zustellung am geschriebenen Namen. Genau
-- daran lag es, als "Matteo" und "Matteo Stano" auseinanderliefen.

alter table public.push_subscriptions
  add column if not exists employee_profile_id uuid;

-- Bestehende Anmeldungen anhand des Namens nachtragen, damit die
-- vorhandenen Geraete nicht neu angemeldet werden muessen.
update public.push_subscriptions as p
set employee_profile_id = e.id
from public.employee_profiles as e
where p.employee_profile_id is null
  and p.employee_name is not null
  and p.employee_name = e.name;

create index if not exists push_subscriptions_profile_idx
  on public.push_subscriptions (employee_profile_id);


-- ------------------------------------------------------------
-- Kontrolle. Sollte drei Zeilen mit "da" zeigen.
-- ------------------------------------------------------------
select 'Kundenurlaub' as was,
       case when to_regclass('public.site_closures') is not null then 'da' else 'fehlt' end as stand
union all
select 'Kundenportal',
       case when exists (select 1 from information_schema.columns
                         where table_name = 'customers' and column_name = 'portal_token')
            then 'da' else 'fehlt' end
union all
select 'Push-Anmeldungen',
       case when exists (select 1 from information_schema.columns
                         where table_name = 'push_subscriptions' and column_name = 'employee_profile_id')
            then 'da' else 'fehlt' end;
