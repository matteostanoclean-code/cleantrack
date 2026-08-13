-- Nachweise zu Abwesenheiten, zum Beispiel Krankmeldungen
--
-- Die App kann jetzt beim Einreichen ein Foto oder PDF anhängen. Die Datei
-- landet im Speicher-Bereich "absence-documents", der beim ersten Upload
-- automatisch angelegt wird und nicht öffentlich ist.
--
-- Diese zwei Spalten merken sich, welche Dateien zu welchem Antrag gehören.
-- Ohne sie funktioniert das Einreichen weiterhin, die Datei wird hochgeladen,
-- aber der Antrag weiß nichts davon.

alter table public.absence_requests
  add column if not exists document_paths text[],
  add column if not exists document_count integer default 0;

-- Kontrolle
select id, employee_name, absence_type, start_date, document_count
from public.absence_requests
order by created_at desc
limit 10;
