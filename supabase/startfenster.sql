-- Spaetester Beginn am Einsatz.
--
-- Bisher gab es nur "frueheste Startzeit" und "fertig bis". Ein zu spaeter
-- Beginn fiel damit nirgends auf -- obwohl genau der Geld kostet: wer statt
-- 19:30 erst 22:00 anfaengt, loest 30 % Nachtzuschlag aus (RTV Gebaeude-
-- reinigung § 3 Nr. 4.2 und 4.7, Nachtarbeit 22.00 bis 5.00 Uhr).
--
-- Ist die Spalte gefuellt und wird spaeter eingestempelt, landet der Satz in
-- der Zeitenfreigabe. Gesperrt wird nichts: wer um 22:00 am Objekt steht,
-- soll arbeiten koennen. Das Buero soll es nur sehen.

alter table public.tasks
  add column if not exists latest_start time;

comment on column public.tasks.latest_start is
  'Spaetester Beginn. Wer danach einstempelt, kommt in die Zeitenfreigabe.';
