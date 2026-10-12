-- Kundenurlaub: wenn beim Kunden zu ist.
--
-- Der Anlass: Betriebsferien beim Kunden sind der beste Zeitraum fuer den
-- Urlaub der eigenen Leute. Bisher stand das nur im Kopf, und die Planung
-- lief daran vorbei.
--
-- Eine eigene Tabelle und nicht absence_requests: ein Mitarbeiter hat einen
-- Anspruch, eine Fortzahlung und eine Genehmigung. Ein geschlossenes Objekt
-- hat nichts davon, es ist einfach zu. Beides in einen Topf zu werfen hiesse,
-- jede Auswertung ueber Urlaubstage haette ab sofort Objekte mitgezaehlt.

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
