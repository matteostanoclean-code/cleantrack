-- ============================================================
-- Aufgaben: Reklamationen, Personalsachen, Kundenanfragen
-- Stand 01.09.2026
-- ============================================================
--
-- Nicht zu verwechseln mit den Einsätzen. Ein Einsatz ist geplante Arbeit an
-- einem Objekt zu einer Uhrzeit. Eine Aufgabe ist ein Vorgang, der auf dem
-- Tisch liegt: eine Reklamation, eine Personalsache, eine Kundenanfrage.
-- Deshalb eine eigene Tabelle und nicht ein weiteres Feld an tasks.
--
-- Jede Aufgabe bekommt ein Kürzel je Art, fortlaufend: REKL-1, REKL-2,
-- PERS-1. Darüber lässt sich am Telefon reden, ohne Titel vorzulesen.
--
-- Zwei Zeiten werden mitgeschrieben:
--   Reaktionszeit    von der Erstellung bis zur ersten Bearbeitung
--   Bearbeitungszeit von der Erstellung bis zum Abschluss
--
-- Einmal im SQL-Editor von Supabase ausführen. Läuft auch mehrfach ohne
-- Schaden.

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),

  ticket_type text not null default 'SONS',
  ticket_number integer,
  identifier text,

  title text not null,
  description text,
  priority text default 'mittel',
  status text default 'neu',

  assigned_to text,
  due_date date,
  created_by text,

  contact_person text,
  contact_phone text,
  contact_email text,

  link_employee_name text,
  link_work_site_id uuid,
  link_work_site_name text,
  link_customer_id uuid,
  link_customer_name text,
  link_task_id uuid,

  -- Zeitpunkte für die Auswertung
  first_response_at timestamptz,
  completed_at timestamptz,
  archived boolean default false,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists tickets_status_idx on public.tickets (status);
create index if not exists tickets_assigned_idx on public.tickets (assigned_to);
create index if not exists tickets_type_idx on public.tickets (ticket_type, ticket_number);

comment on table public.tickets is
  'Aufgaben und Vorgaenge: Reklamationen, Personalsachen, Kundenanfragen. Nicht die Einsaetze, die stehen in tasks.';
comment on column public.tickets.identifier is
  'Kuerzel wie REKL-2, fortlaufend je Art. Wird beim Anlegen vergeben.';
comment on column public.tickets.first_response_at is
  'Wann die Aufgabe zum ersten Mal aus dem Zustand "neu" bewegt wurde.';

-- Kontrolle: sollte die Tabelle mit ihren Spalten zeigen.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'tickets'
order by ordinal_position;
