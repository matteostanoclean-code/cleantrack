-- Bestaetigung beim frueheren Ausstempeln.
--
-- Wer deutlich vor der eingeplanten Zeit fertig ist, bekommt in der App die
-- Frage: "Sind alle Aufgaben aus dem Leistungsverzeichnis erledigt?" Die
-- Antwort wird hier festgehalten.
--
-- Nicht als Beweismittel gegen den Mitarbeiter gedacht, sondern damit bei
-- einer Reklamation nachlesbar ist, was an dem Tag bestaetigt wurde. Ohne das
-- steht spaeter Aussage gegen Aussage.

alter table public.time_entries
  add column if not exists leistung_bestaetigt boolean;

comment on column public.time_entries.leistung_bestaetigt is
  'true: beim frueheren Ausstempeln wurde bestaetigt, dass das Leistungsverzeichnis abgearbeitet ist. Leer: die Frage kam nicht.';
