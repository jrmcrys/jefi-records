/*
  Jefi Records: phase 17 database update (Notes)

  note_folders: each person's own nested folders (with emoji and color).
  notes: private by default, shared per note. The other person can edit the
    words of a shared note; only the owner moves, shares, archives or deletes
    it (enforced by the notes_guard trigger, which also stamps who edited).
    deleted_at is Recently deleted (emptied after 30 days by the app).
  note_prefs: each person's pins and last-opened times.
  note_tags: tags from the same list as tasks.
  Storage: a private "notes" bucket. Files sit in a folder named after the
    note, and anyone who can see the note can open them.

  Applied by Claude through the Supabase connection. Kept here as a record.
*/

create table if not exists public.note_folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  parent_id uuid references public.note_folders (id) on delete cascade,
  name text not null,
  emoji text,
  color text,
  position double precision not null default 0,
  created_at timestamptz not null default now()
);

alter table public.note_folders enable row level security;

create policy "own note folders" on public.note_folders
  for all using (public.is_member() and owner_id = auth.uid())
  with check (public.is_member() and owner_id = auth.uid());

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  folder_id uuid references public.note_folders (id) on delete set null,
  title text not null default '',
  content jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  text text not null default '',
  visibility text not null default 'private' check (visibility in ('private', 'shared')),
  emoji text,
  image_url text,
  archived boolean not null default false,
  deleted_at timestamptz,
  project_id uuid references public.projects (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references public.profiles (id) on delete set null
);

create index if not exists notes_owner_idx on public.notes (owner_id, updated_at desc);
create index if not exists notes_folder_idx on public.notes (folder_id);

alter table public.notes enable row level security;
alter table public.notes replica identity full;

create policy "see own or shared notes" on public.notes
  for select using (public.is_member() and (owner_id = auth.uid() or visibility = 'shared'));

create policy "create own notes" on public.notes
  for insert with check (public.is_member() and owner_id = auth.uid());

create policy "edit own or shared notes" on public.notes
  for update using (public.is_member() and (owner_id = auth.uid() or visibility = 'shared'))
  with check (public.is_member());

create policy "delete own notes" on public.notes
  for delete using (public.is_member() and owner_id = auth.uid());

create or replace function public.notes_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is distinct from old.owner_id then
    new.owner_id := old.owner_id;
    new.visibility := old.visibility;
    new.folder_id := old.folder_id;
    new.archived := old.archived;
    new.deleted_at := old.deleted_at;
    new.project_id := old.project_id;
  end if;
  if new.content is distinct from old.content or new.title is distinct from old.title then
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

create or replace trigger notes_guard_trg
  before update on public.notes
  for each row execute function public.notes_guard();

create table if not exists public.note_prefs (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  note_id uuid not null references public.notes (id) on delete cascade,
  pinned boolean not null default false,
  last_opened_at timestamptz,
  primary key (user_id, note_id)
);

alter table public.note_prefs enable row level security;

create policy "own note prefs" on public.note_prefs
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.notes n where n.id = note_id));

create table if not exists public.note_tags (
  note_id uuid not null references public.notes (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (note_id, tag_id)
);

alter table public.note_tags enable row level security;

create policy "tags on visible notes" on public.note_tags
  for all using (public.is_member() and exists (select 1 from public.notes n where n.id = note_id))
  with check (public.is_member() and exists (select 1 from public.notes n where n.id = note_id));

alter publication supabase_realtime add table public.notes, public.note_folders, public.note_tags;

insert into storage.buckets (id, name, public, file_size_limit)
values ('notes', 'notes', false, 26214400)
on conflict (id) do nothing;

create policy "read files of visible notes" on storage.objects
  for select using (
    bucket_id = 'notes' and exists (
      select 1 from public.notes n where n.id::text = (storage.foldername(name))[1]
    )
  );

create policy "add files to editable notes" on storage.objects
  for insert with check (
    bucket_id = 'notes' and public.is_member() and exists (
      select 1 from public.notes n where n.id::text = (storage.foldername(name))[1]
    )
  );

create policy "owner removes note files" on storage.objects
  for delete using (
    bucket_id = 'notes' and exists (
      select 1 from public.notes n
      where n.id::text = (storage.foldername(name))[1] and n.owner_id = auth.uid()
    )
  );
