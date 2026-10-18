-- Mithilfe: wenn jemand mitgeht, der dort keinen eigenen Einsatz hat.
--
-- Der Anlass: Nertil hat den Einsatz, Elona faehrt mit und hilft. Bisher
-- konnte sie gar nicht stempeln — ein Einsatz haengt an genau einer Person,
-- und ohne eigenen Einsatz verweigert die App die Buchung. Ihre Stunden
-- fielen still unter den Tisch.
--
-- Die Loesung bleibt beim Datenmodell: sie bekommt einen eigenen Einsatz,
-- nur legt den jetzt die App beim Scannen an statt das Buero vorher. Zwei
-- Personen, zwei Einsaetze, zwei Buchungen. Nur so stimmen Lohn und die
-- Kostenseite am Objekt: zwei Leute zwei Stunden sind vier Stunden Lohn.
--
-- Zwei Spalten, damit im Buero sichtbar bleibt, wie der Einsatz entstanden
-- ist. Ein Einsatz, den niemand geplant hat, soll man erkennen koennen.

alter table public.tasks
  add column if not exists helfer_zu     uuid,
  add column if not exists auto_erstellt boolean default false;

create index if not exists tasks_helfer_idx on public.tasks (helfer_zu);

comment on column public.tasks.helfer_zu is
  'Der Einsatz, bei dem hier mitgeholfen wird. Gesetzt, wenn die App den Einsatz beim Scannen angelegt hat.';
comment on column public.tasks.auto_erstellt is
  'true: nicht vom Buero geplant, sondern beim Scannen entstanden.';
