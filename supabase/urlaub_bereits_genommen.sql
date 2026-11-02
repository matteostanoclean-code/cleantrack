-- Bereits genommene Urlaubstage, die nicht in der App stehen.
--
-- Der Anlass: Bis 2026 lief der Urlaub in einer Excel-Liste. In Schichtklar
-- steht deshalb nur ein Bruchteil der Abwesenheiten, und die Rechnung
-- "Anspruch minus genommen" ergab bei allen den vollen Anspruch -- also eine
-- Zahl, auf die man sich nicht verlassen kann.
--
-- Hier kommt der Altbestand hinein: wieviele Tage in diesem Jahr schon
-- genommen sind, ohne dass eine Abwesenheit dazu in der App liegt. Die
-- Resttage sind dann Anspruch minus (dieser Wert plus die Abwesenheiten in
-- der App).
--
-- Das Jahr steht ausdruecklich dabei. Ohne das schleppte sich der Wert in
-- den naechsten Januar und jeder haette dort schon zwanzig Tage verbraucht.
-- Passt das Jahr nicht zum laufenden, wird der Wert als 0 gelesen.

alter table public.employee_profiles
  add column if not exists urlaub_bereits_genommen numeric,
  add column if not exists urlaub_genommen_jahr    integer;

comment on column public.employee_profiles.urlaub_bereits_genommen is
  'Urlaubstage, die im Jahr urlaub_genommen_jahr schon genommen wurden, ohne Abwesenheit in der App.';
comment on column public.employee_profiles.urlaub_genommen_jahr is
  'Zu welchem Jahr urlaub_bereits_genommen gehoert. Stimmt es nicht mit dem laufenden Jahr ueberein, zaehlt der Wert nicht mit.';

-- Kontrolle.
select name, annual_vacation_days as anspruch,
       urlaub_bereits_genommen as bereits_genommen,
       urlaub_genommen_jahr as jahr
from public.employee_profiles
where coalesce(active, true)
order by name;
