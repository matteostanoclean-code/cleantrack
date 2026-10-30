-- Inhaber: arbeitet mit, gehoert aber nicht in die Team-Uebersichten.
--
-- Der Anlass: In "Einrichtung im Team" stand Matteo selbst. Die Uebersicht
-- fragt, wer die App schon benutzt -- bei dem, der davorsitzt, ist das keine
-- Frage. Matteo_admin fiel ueber die Rolle schon raus, das zweite Profil
-- "Matteo Stano" nicht: das ist technisch ein ganz normaler Mitarbeiter.
--
-- Ueber den Namen zu filtern waere falsch. Zwei Profile derselben Person sind
-- am Namen nicht zu erkennen, und beim naechsten Mitarbeiter mit aehnlichem
-- Namen faengt das Raten von vorn an. Deshalb ein Haken, den jemand setzt.

alter table public.employee_profiles
  add column if not exists inhaber boolean default false;

comment on column public.employee_profiles.inhaber is
  'true: taucht in Team-Uebersichten wie der Einrichtung nicht auf. Einsaetze, Zeiten und Lohn bleiben unberuehrt.';

-- Die beiden Profile von Matteo kennzeichnen.
update public.employee_profiles
   set inhaber = true
 where name in ('Matteo Stano', 'Matteo_admin');
