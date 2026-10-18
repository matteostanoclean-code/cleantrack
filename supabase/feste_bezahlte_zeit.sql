-- Feste bezahlte Zeit je Mitarbeiter.
--
-- Normalfall: bezahlt wird, was gestempelt wurde. Bei einzelnen Leuten ist
-- aber eine feste Zeit vereinbart — die wird bezahlt, auch wenn sie frueher
-- fertig waren. Mehrarbeit kommt obendrauf, sie wird nie gekuerzt.
--
-- Bisher gab es dafuer nur einen betriebsweiten Schalter in den Einstellungen.
-- Der trifft aber alle, und genau das ist hier falsch: es haengt an der
-- Vereinbarung mit der einzelnen Person.

alter table public.employee_profiles
  add column if not exists fixed_paid_time boolean default false;

comment on column public.employee_profiles.fixed_paid_time is
  'true: die vereinbarte Zeit wird bezahlt, auch bei kuerzerer Stempelzeit. Mehrarbeit kommt dazu.';
