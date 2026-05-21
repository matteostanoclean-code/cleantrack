-- CleanTrack Mobile: Mehr-Funktionen absichern
-- In Supabase SQL Editor ausführen, falls Material, Chat oder Abwesenheit Fehler melden.

create table if not exists public.absence_requests (
  id uuid primary key default gen_random_uuid(),
  employee_name text,
  request_type text,
  absence_type text,
  start_date date,
  end_date date,
  reason text,
  status text default 'open',
  created_at timestamptz default now(),
  employee_profile_id uuid,
  decided_at timestamptz,
  admin_response text
);

alter table public.absence_requests add column if not exists employee_name text;
alter table public.absence_requests add column if not exists request_type text;
alter table public.absence_requests add column if not exists absence_type text;
alter table public.absence_requests add column if not exists start_date date;
alter table public.absence_requests add column if not exists end_date date;
alter table public.absence_requests add column if not exists reason text;
alter table public.absence_requests add column if not exists status text default 'open';
alter table public.absence_requests add column if not exists created_at timestamptz default now();
alter table public.absence_requests add column if not exists employee_profile_id uuid;
alter table public.absence_requests add column if not exists decided_at timestamptz;
alter table public.absence_requests add column if not exists admin_response text;

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  employee_name text,
  message text,
  body text,
  text text,
  sender_name text,
  sender_role text,
  read_by_admin boolean default false,
  read_by_employee boolean default false,
  status text default 'open',
  todo_status text default 'open',
  resolved_at timestamptz,
  created_at timestamptz default now()
);

alter table public.chat_messages add column if not exists employee_name text;
alter table public.chat_messages add column if not exists message text;
alter table public.chat_messages add column if not exists body text;
alter table public.chat_messages add column if not exists text text;
alter table public.chat_messages add column if not exists sender_name text;
alter table public.chat_messages add column if not exists sender_role text;
alter table public.chat_messages add column if not exists read_by_admin boolean default false;
alter table public.chat_messages add column if not exists read_by_employee boolean default false;
alter table public.chat_messages add column if not exists status text default 'open';
alter table public.chat_messages add column if not exists todo_status text default 'open';
alter table public.chat_messages add column if not exists resolved_at timestamptz;
alter table public.chat_messages add column if not exists created_at timestamptz default now();

create table if not exists public.material_products (
  id uuid primary key default gen_random_uuid(),
  name text,
  category text,
  unit text default 'Stück',
  current_stock numeric default 0,
  min_stock numeric default 0,
  minimum_stock numeric default 0,
  supplier text,
  work_site_id uuid,
  object_name text,
  image_url text,
  notes text,
  created_at timestamptz default now()
);

alter table public.material_products add column if not exists name text;
alter table public.material_products add column if not exists category text;
alter table public.material_products add column if not exists unit text default 'Stück';
alter table public.material_products add column if not exists current_stock numeric default 0;
alter table public.material_products add column if not exists min_stock numeric default 0;
alter table public.material_products add column if not exists minimum_stock numeric default 0;
alter table public.material_products add column if not exists supplier text;
alter table public.material_products add column if not exists work_site_id uuid;
alter table public.material_products add column if not exists object_name text;
alter table public.material_products add column if not exists image_url text;
alter table public.material_products add column if not exists notes text;
alter table public.material_products add column if not exists created_at timestamptz default now();

create table if not exists public.material_reports (
  id uuid primary key default gen_random_uuid(),
  employee_name text,
  employee_profile_id uuid,
  material_id uuid,
  material_product_id uuid,
  material_name text,
  product_name text,
  work_site_id uuid,
  object_name text,
  site text,
  quantity numeric default 1,
  quantity_requested numeric default 1,
  message text,
  comment text,
  notes text,
  status text default 'open',
  created_at timestamptz default now()
);

alter table public.material_reports add column if not exists employee_name text;
alter table public.material_reports add column if not exists employee_profile_id uuid;
alter table public.material_reports add column if not exists material_id uuid;
alter table public.material_reports add column if not exists material_product_id uuid;
alter table public.material_reports add column if not exists material_name text;
alter table public.material_reports add column if not exists product_name text;
alter table public.material_reports add column if not exists work_site_id uuid;
alter table public.material_reports add column if not exists object_name text;
alter table public.material_reports add column if not exists site text;
alter table public.material_reports add column if not exists quantity numeric default 1;
alter table public.material_reports add column if not exists quantity_requested numeric default 1;
alter table public.material_reports add column if not exists message text;
alter table public.material_reports add column if not exists comment text;
alter table public.material_reports add column if not exists notes text;
alter table public.material_reports add column if not exists status text default 'open';
alter table public.material_reports add column if not exists created_at timestamptz default now();

alter table public.admin_notifications add column if not exists material_product_id uuid;
alter table public.admin_notifications add column if not exists material_name text;
alter table public.admin_notifications add column if not exists absence_request_id uuid;
alter table public.admin_notifications add column if not exists object_name text;
alter table public.admin_notifications add column if not exists site text;
alter table public.admin_notifications add column if not exists status text default 'open';
alter table public.admin_notifications add column if not exists notification_type text;

create index if not exists idx_absence_requests_employee_created on public.absence_requests(employee_name, created_at);
create index if not exists idx_chat_messages_employee_created on public.chat_messages(employee_name, created_at);
create index if not exists idx_material_reports_employee_created on public.material_reports(employee_name, created_at);
create index if not exists idx_material_products_work_site on public.material_products(work_site_id);
