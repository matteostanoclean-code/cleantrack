-- Schliesszeiten aus Kundenantworten: erst Vorschlag, dann Eintrag.
--
-- Der Anlass: Einmal im Jahr fragt das Buero die Kunden nach ihren
-- Betriebsferien. Die Antworten kommen als Fliesstext -- "wir haben vom 23.12.
-- bis einschliesslich 6.1. zu, der 7. ist Brueckentag". Daraus automatisch
-- einen Zeitraum zu machen geht irgendwann schief, und zwar unbemerkt: der
-- Einsatz faellt aus, obwohl der Kunde offen hat.
--
-- Deshalb landet eine gelesene Antwort als *unbestaetigte* Zeile. Der Planer
-- sieht sie nicht an. Im Urlaubsplaner stehen sie als Vorschlag, mit dem Satz
-- aus der Mail daneben, und werden mit einem Tipp uebernommen oder verworfen.
--
-- Bewusst keine zweite Tabelle: ein Vorschlag und ein Eintrag sind dieselbe
-- Sache in zwei Zustaenden. Zwei Tabellen hiessen, jede Auswertung muesste
-- beide lesen und am Ende doch zusammenfuehren.
--
-- bestaetigt = true ist die Vorgabe, damit alles von Hand Eingetragene
-- unveraendert weiterlaeuft.

alter table public.site_closures
  add column if not exists bestaetigt boolean not null default true,
  add column if not exists quelle     text,
  add column if not exists absender   text,
  add column if not exists zitat      text,
  add column if not exists erkannt_at timestamptz;

create index if not exists site_closures_offen_idx
  on public.site_closures (bestaetigt)
  where bestaetigt = false;

comment on column public.site_closures.bestaetigt is
  'false: Vorschlag aus einer Kundenantwort, vom Planer ignoriert, bis jemand zustimmt.';
comment on column public.site_closures.quelle is
  'Woher der Zeitraum kommt: buero (von Hand) oder mail.';
comment on column public.site_closures.absender is
  'Mailadresse, aus deren Antwort der Vorschlag stammt.';
comment on column public.site_closures.zitat is
  'Der Satz aus der Mail, auf dem der Vorschlag beruht. Damit man nachlesen kann, bevor man zustimmt.';

-- Kontrolle.
select count(*) filter (where bestaetigt) as eingetragen,
       count(*) filter (where not bestaetigt) as vorschlaege
from public.site_closures;
