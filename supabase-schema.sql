-- Cudii & Ace — Project HQ schema
-- Paste this whole file into Supabase → SQL Editor → Run.

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client text default '',
  status text default 'Lead',
  created_at timestamptz default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  title text not null,
  done boolean default false,
  created_at timestamptz default now()
);

create table if not exists costs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  label text not null,
  amount numeric not null default 0,
  created_at timestamptz default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  author text not null,
  body text not null,
  created_at timestamptz default now()
);

-- Realtime
alter publication supabase_realtime add table projects;
alter publication supabase_realtime add table tasks;
alter publication supabase_realtime add table costs;
alter publication supabase_realtime add table messages;

-- Row Level Security: this is a private 2-person board with no login,
-- so the anon key is allowed full access. Keep the anon key private
-- (it lives in config.js in a repo you control). Lock down later with
-- Supabase Auth if you want stricter control.
alter table projects enable row level security;
alter table tasks    enable row level security;
alter table costs    enable row level security;
alter table messages enable row level security;

do $$
declare t text;
begin
  foreach t in array array['projects','tasks','costs','messages'] loop
    execute format('drop policy if exists "anon all" on %I;', t);
    execute format('create policy "anon all" on %I for all to anon using (true) with check (true);', t);
  end loop;
end $$;
