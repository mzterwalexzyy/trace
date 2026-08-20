-- TRACE — Supabase schema (Increment 1: data layer)
--
-- Multi-user persistence for analyzed repositories, their analysis runs
-- (snapshots), and a pointer to the graph blob stored in Supabase Storage.
-- Every row is owned by a user (auth.users). Row Level Security enforces that a
-- signed-in user can only see and mutate their own rows. The Node worker uses
-- the service-role key, which bypasses RLS, and sets `owner` explicitly.
--
-- Apply with:  supabase db push   (or paste into the SQL editor)

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- repositories: one row per repo a user has connected/analyzed
-- ---------------------------------------------------------------------------
create table if not exists public.repositories (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid not null references auth.users (id) on delete cascade,
  name          text not null,
  source        text not null default 'local' check (source in ('local', 'git')),
  git_url       text,
  local_path    text,
  default_branch text not null default 'main',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- a user cannot register the same repo twice
  unique (owner, name)
);

-- ---------------------------------------------------------------------------
-- analysis_runs: one row per analyze() — the eval-run / snapshot record
-- ---------------------------------------------------------------------------
create table if not exists public.analysis_runs (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid not null references auth.users (id) on delete cascade,
  repository_id uuid not null references public.repositories (id) on delete cascade,
  snapshot_id   text not null,
  branch        text not null default 'main',
  commit_sha    text,
  status        text not null default 'Completed',
  files         int  not null default 0,
  functions     int  not null default 0,
  endpoints     int  not null default 0,
  db_schemas    int  not null default 0,
  tests         int  not null default 0,
  node_count    int  not null default 0,
  edge_count    int  not null default 0,
  started_at    timestamptz not null default now()
);

create index if not exists analysis_runs_owner_started_idx
  on public.analysis_runs (owner, started_at desc);
create index if not exists analysis_runs_repo_idx
  on public.analysis_runs (repository_id, started_at desc);

-- ---------------------------------------------------------------------------
-- graphs: pointer to the persisted graph JSON blob in Storage (bucket "graphs")
-- ---------------------------------------------------------------------------
create table if not exists public.graphs (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid not null references auth.users (id) on delete cascade,
  repository_id uuid not null references public.repositories (id) on delete cascade,
  snapshot_id   text not null,
  storage_path  text not null,            -- e.g. <owner>/<repo>/<snapshot>.json
  node_count    int  not null default 0,
  edge_count    int  not null default 0,
  created_at    timestamptz not null default now(),
  unique (repository_id, snapshot_id)
);

-- keep updated_at fresh on repositories
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists repositories_touch on public.repositories;
create trigger repositories_touch
  before update on public.repositories
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security: users only ever touch their own rows
-- ---------------------------------------------------------------------------
alter table public.repositories  enable row level security;
alter table public.analysis_runs enable row level security;
alter table public.graphs        enable row level security;

do $$
declare t text;
begin
  foreach t in array array['repositories','analysis_runs','graphs'] loop
    execute format('drop policy if exists "owner_select" on public.%I;', t);
    execute format('drop policy if exists "owner_insert" on public.%I;', t);
    execute format('drop policy if exists "owner_update" on public.%I;', t);
    execute format('drop policy if exists "owner_delete" on public.%I;', t);
    execute format('create policy "owner_select" on public.%I for select using (owner = auth.uid());', t);
    execute format('create policy "owner_insert" on public.%I for insert with check (owner = auth.uid());', t);
    execute format('create policy "owner_update" on public.%I for update using (owner = auth.uid()) with check (owner = auth.uid());', t);
    execute format('create policy "owner_delete" on public.%I for delete using (owner = auth.uid());', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Storage bucket for graph blobs (private). Access is authorized per-object
-- by the owner-prefixed path, enforced with storage.objects RLS below.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('graphs', 'graphs', false)
on conflict (id) do nothing;

drop policy if exists "graphs_owner_rw" on storage.objects;
create policy "graphs_owner_rw" on storage.objects
  for all
  using (bucket_id = 'graphs' and (auth.uid())::text = (storage.foldername(name))[1])
  with check (bucket_id = 'graphs' and (auth.uid())::text = (storage.foldername(name))[1]);
