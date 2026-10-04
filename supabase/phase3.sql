/*
  Jefi Records: phase 3 database update

  Adds private and public projects, per-person project order, and profile
  photo storage. Already applied to the live database by Claude through the
  Supabase connection. Kept here as a record and for rebuilding from scratch.

  Rules:
  - Public project: both people see it and edit its tasks, sections, statuses.
  - Private project: only the owner sees it or anything inside it.
  - Only the owner can rename, archive, delete, or change visibility.
*/

alter table public.projects
  add column if not exists visibility text not null default 'public'
  check (visibility in ('public', 'private'));

alter table public.projects alter column created_by set not null;

/* Helper checks used by the policies below. */

create or replace function public.can_access_project(pid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.is_member() and exists (
    select 1 from public.projects p
    where p.id = pid
      and (p.visibility = 'public' or p.created_by = auth.uid())
  );
$$;

create or replace function public.can_access_task(tid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.tasks t
    where t.id = tid and public.can_access_project(t.project_id)
  );
$$;

create or replace function public.can_access_comment(cid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.comments c
    where c.id = cid and public.can_access_task(c.task_id)
  );
$$;

/* Replace the open "members full access" policies. */

drop policy if exists "members full access" on public.projects;
drop policy if exists "members full access" on public.sections;
drop policy if exists "members full access" on public.project_statuses;
drop policy if exists "members full access" on public.tasks;
drop policy if exists "members full access" on public.field_definitions;
drop policy if exists "members full access" on public.saved_views;
drop policy if exists "members full access" on public.task_field_values;
drop policy if exists "members full access" on public.task_tags;
drop policy if exists "members full access" on public.comments;
drop policy if exists "members full access" on public.attachments;

create policy "see public or own projects" on public.projects
  for select using (
    public.is_member()
    and (visibility = 'public' or created_by = auth.uid())
  );

create policy "create own projects" on public.projects
  for insert with check (public.is_member() and created_by = auth.uid());

create policy "owner updates project" on public.projects
  for update
  using (public.is_member() and created_by = auth.uid())
  with check (public.is_member() and created_by = auth.uid());

create policy "owner deletes project" on public.projects
  for delete using (public.is_member() and created_by = auth.uid());

create policy "project access" on public.sections
  for all
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));

create policy "project access" on public.project_statuses
  for all
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));

create policy "project access" on public.tasks
  for all
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));

create policy "project access" on public.field_definitions
  for all
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));

create policy "project access" on public.saved_views
  for all
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));

create policy "task access" on public.task_field_values
  for all
  using (public.can_access_task(task_id))
  with check (public.can_access_task(task_id));

create policy "task access" on public.task_tags
  for all
  using (public.can_access_task(task_id))
  with check (public.can_access_task(task_id));

create policy "read comments" on public.comments
  for select using (public.can_access_task(task_id));

create policy "write own comments" on public.comments
  for insert with check (
    public.can_access_task(task_id) and author_id = auth.uid()
  );

create policy "edit own comments" on public.comments
  for update
  using (public.can_access_task(task_id) and author_id = auth.uid())
  with check (public.can_access_task(task_id) and author_id = auth.uid());

create policy "delete own comments" on public.comments
  for delete using (
    public.can_access_task(task_id) and author_id = auth.uid()
  );

create policy "attachment access" on public.attachments
  for all
  using (
    (task_id is not null and public.can_access_task(task_id))
    or (comment_id is not null and public.can_access_comment(comment_id))
  )
  with check (
    (task_id is not null and public.can_access_task(task_id))
    or (comment_id is not null and public.can_access_comment(comment_id))
  );

/* Each person keeps their own sidebar order for projects. */

create table if not exists public.project_prefs (
  user_id uuid not null default auth.uid()
    references public.profiles (id) on delete cascade,
  project_id uuid not null
    references public.projects (id) on delete cascade,
  position double precision not null default 0,
  primary key (user_id, project_id)
);

alter table public.project_prefs enable row level security;

create policy "own project order" on public.project_prefs
  for all
  using (public.is_member() and user_id = auth.uid())
  with check (
    user_id = auth.uid() and public.can_access_project(project_id)
  );

/* Profile photos. Public bucket, files stored under the owner's id. */

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars', 'avatars', true, 2097152,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

create policy "members list avatars" on storage.objects
  for select using (bucket_id = 'avatars' and public.is_member());

create policy "upload own avatar" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and public.is_member()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "update own avatar" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "delete own avatar" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

/* Live updates when a profile name or photo changes. */

alter publication supabase_realtime add table public.profiles;
