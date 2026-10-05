/*
  Jefi Records: phase 16 database update (Docs and Sheets overhaul)

  1. google_links gets a picture or emoji, a short note, a color label, a
     section, archive, an optional project and task it is attached to, and a
     review reminder date. Only the person who added an item changes these.
  2. google_link_prefs (each person's own) gets a pin and the time the person
     last opened the item.
  3. link_tags: tags on Docs and Sheets, from the same tag list as tasks.
     Either person can tag anything they can see.

  Applied by Claude through the Supabase connection. Kept here as a record.
*/

alter table public.google_links
  add column if not exists emoji text,
  add column if not exists image_url text,
  add column if not exists note text,
  add column if not exists color text,
  add column if not exists section text,
  add column if not exists archived boolean not null default false,
  add column if not exists project_id uuid references public.projects (id) on delete set null,
  add column if not exists task_id uuid references public.tasks (id) on delete set null,
  add column if not exists review_on date;

alter table public.google_link_prefs
  add column if not exists pinned boolean not null default false,
  add column if not exists last_opened_at timestamptz;

create table if not exists public.link_tags (
  link_id uuid not null references public.google_links (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (link_id, tag_id)
);

alter table public.link_tags enable row level security;

create policy "tags on visible links" on public.link_tags
  for all using (
    public.is_member() and exists (select 1 from public.google_links l where l.id = link_id)
  )
  with check (
    public.is_member() and exists (select 1 from public.google_links l where l.id = link_id)
  );

alter publication supabase_realtime add table public.link_tags;
