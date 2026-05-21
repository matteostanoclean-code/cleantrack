-- CleanTrack Mobile: Foto-Upload für Materialmeldungen
-- In Supabase SQL Editor ausführen, wenn Materialfotos gespeichert und im Adminbereich angezeigt werden sollen.

alter table public.material_reports add column if not exists photo_urls text[] default '{}';
alter table public.material_reports add column if not exists photo_count integer default 0;

-- Optional, damit Meldungen mit Foto schneller gefunden werden.
create index if not exists idx_material_reports_photo_count on public.material_reports(photo_count);

-- Storage Bucket wird zusätzlich beim ersten Upload automatisch durch die App angelegt.
-- Falls du ihn lieber direkt in Supabase anlegst, verwende den Namen:
-- material-photos
