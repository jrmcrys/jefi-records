/*
  Jefi Records: phase 9 database update

  Docs and Sheets lists (Google links), each public or private, with a
  personal order for each person, plus a prefs column on profiles for the
  "open inside the app or in Google" setting. Already applied by Claude
  through the Supabase connection.
*/

alter table public.profiles
  add column if not exists prefs jsonb not null default '{}'::jsonb;

create table if not exists public.google_links (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('doc', 'sheet')),
  title text not null,
  url text not null,
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists google_links_kind_idx on public.google_links (kind, created_at);

alter table public.google_links enable row level security;

create policy "read visible links" on public.google_links
  for select using (
    public.is_member() and (visibility = 'public' or created_by = auth.uid())
  );

create policy "add own links" on public.google_links
  for insert with check (public.is_member() and created_by = auth.uid());

create policy "edit own links" on public.google_links
  for update using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy "delete own links" on public.google_links
  for delete using (created_by = auth.uid());

create table if not exists public.google_link_prefs (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  link_id uuid not null references public.google_links (id) on delete cascade,
  position double precision not null,
  primary key (user_id, link_id)
);

alter table public.google_link_prefs enable row level security;

create policy "manage own link order" on public.google_link_prefs
  for all using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.google_links l where l.id = link_id)
  );

alter publication supabase_realtime add table public.google_links;
