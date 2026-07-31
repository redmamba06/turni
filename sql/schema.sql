-- ============================================================
--  Turni Gelateria — Schema Supabase (Fase 1: dati + login)
--  Copia TUTTO e incollalo nell'editor SQL di Supabase, poi "Run".
-- ============================================================

-- Impostazioni: una riga per utente
create table if not exists public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  hourly_pay numeric default 0,
  week_starts_monday boolean default true,
  theme text default 'auto',
  tz text default 'Europe/Rome',
  updated_at timestamptz default now()
);

-- Sedi
create table if not exists public.locations (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text default '#2563EB',
  created_at timestamptz default now()
);

-- Colleghi
create table if not exists public.colleagues (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

-- Turni
create table if not exists public.shifts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text default 'shift',           -- 'shift' | 'bulk'
  date date not null,                  -- (bulk: inizio periodo)
  date_to date,                        -- (bulk: fine periodo)
  start text,                          -- 'HH:MM'
  "end" text,                          -- 'HH:MM'
  hours numeric,
  break_min int default 0,
  label text default '',
  location_id text,
  colleague_ids text[] default '{}',
  rating int,
  note text default '',
  notified_end_at timestamptz,         -- quando è stata mandata la notifica di fine (Fase 2)
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists shifts_user_date on public.shifts(user_id, date);
create index if not exists shifts_reminder on public.shifts(type, notified_end_at) where type = 'shift';

-- Iscrizioni push (Fase 2, ma la creiamo adesso)
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  tz text default 'Europe/Rome',
  created_at timestamptz default now(),
  unique (user_id, endpoint)
);

-- Profili (nome/cognome per utente; is_admin per future funzioni admin)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text default '',
  last_name text default '',
  full_name text default '',
  email text,
  is_admin boolean default false,
  created_at timestamptz default now()
);

-- ---------- Sicurezza: ognuno vede solo i propri dati ----------
alter table public.profiles enable row level security;
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
alter table public.settings           enable row level security;
alter table public.locations          enable row level security;
alter table public.colleagues         enable row level security;
alter table public.shifts             enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "own settings"  on public.settings;
drop policy if exists "own locations" on public.locations;
drop policy if exists "own colleagues" on public.colleagues;
drop policy if exists "own shifts"    on public.shifts;
drop policy if exists "own subs"      on public.push_subscriptions;

create policy "own settings"   on public.settings           for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own locations"  on public.locations          for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own colleagues" on public.colleagues         for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own shifts"     on public.shifts             for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own subs"       on public.push_subscriptions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Fine Fase 1. (Il motore delle notifiche si aggiunge nella Fase 2.)
