/*
  Jefi Records: database schema (phase 1)

  How to run: Supabase dashboard > SQL Editor > New query > paste this whole
  file > Run. It is safe to run once on a fresh project.

  Access model: only the two emails in allowed_emails can create an account,
  and every table is readable and writable only by signed-in members.
*/

create extension if not exists "pgcrypto";

/* Allowlist: the only two people who can sign up                      */

create table public.allowed_emails (
  email text primary key check (email = lower(email))
);

insert into public.allowed_emails (email) values
  ('jrmcrys.work@gmail.com'),
  ('effiemagugat.work@gmail.com');

alter table public.allowed_emails enable row level security;
/* No policies on purpose: the table is only read by security definer functions. */

create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.allowed_emails
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

/* Block sign-ups from any email that is not on the list. */
create or replace function public.enforce_allowed_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.allowed_emails where email = lower(new.email)
  ) then
    raise exception 'Email % is not on the invite list', new.email;
  end if;
  return new;
end;
$$;

create trigger enforce_allowed_email_trg
  before insert on auth.users
  for each row execute function public.enforce_allowed_email();

/* Profiles                                                            */

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null,
  avatar_url text,
  push_subscription jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    case lower(new.email)
      when 'jrmcrys.work@gmail.com' then 'Jerome'
      when 'effiemagugat.work@gmail.com' then 'Effie'
      else split_part(new.email, '@', 1)
    end,
    lower(new.email)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

/* Projects, sections, statuses                                        */

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  archived boolean not null default false,
  position double precision not null default 0,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.sections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  position double precision not null default 0,
  created_at timestamptz not null default now()
);
create index sections_project_idx on public.sections (project_id);

/* Editable status options per project. Defaults are added automatically. */
create table public.project_statuses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  color text not null default '#71717a',
  position double precision not null default 0,
  is_done boolean not null default false
);
create index project_statuses_project_idx on public.project_statuses (project_id);

create or replace function public.seed_project_statuses()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.project_statuses (project_id, name, color, position, is_done) values
    (new.id, 'To do', '#71717a', 1, false),
    (new.id, 'Doing', '#2563eb', 2, false),
    (new.id, 'Done',  '#16a34a', 3, true);
  return new;
end;
$$;

create trigger seed_project_statuses_trg
  after insert on public.projects
  for each row execute function public.seed_project_statuses();

/* Tasks                                                               */

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  section_id uuid references public.sections (id) on delete set null,
  parent_task_id uuid references public.tasks (id) on delete cascade,
  name text not null,
  description text not null default '',
  status_id uuid references public.project_statuses (id) on delete set null,
  assignee_id uuid references public.profiles (id) on delete set null,
  due_at timestamptz,
  due_has_time boolean not null default false,
  recurrence jsonb,
  completed_at timestamptz,
  position double precision not null default 0,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_project_idx on public.tasks (project_id);
create index tasks_section_idx on public.tasks (section_id);
create index tasks_parent_idx on public.tasks (parent_task_id);
create index tasks_assignee_idx on public.tasks (assignee_id);
create index tasks_due_idx on public.tasks (due_at);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tasks_touch_updated_at
  before update on public.tasks
  for each row execute function public.touch_updated_at();

/* Custom fields                                                       */

create type public.field_type as enum (
  'dropdown', 'multi_select', 'text', 'number', 'url', 'checkbox', 'person'
);

create table public.field_definitions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  type public.field_type not null,
  options jsonb not null default '[]'::jsonb,
  position double precision not null default 0,
  visible boolean not null default true,
  width integer
);
create index field_definitions_project_idx on public.field_definitions (project_id);

create table public.task_field_values (
  task_id uuid not null references public.tasks (id) on delete cascade,
  field_id uuid not null references public.field_definitions (id) on delete cascade,
  value jsonb,
  primary key (task_id, field_id)
);

/* Tags                                                                */

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#71717a'
);

create table public.task_tags (
  task_id uuid not null references public.tasks (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (task_id, tag_id)
);

create table public.tag_follows (
  tag_id uuid not null references public.tags (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  primary key (tag_id, user_id)
);

/* Comments, attachments, notifications, saved views                   */

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  author_id uuid not null references public.profiles (id) default auth.uid(),
  body text not null,
  mentions uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index comments_task_idx on public.comments (task_id);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks (id) on delete cascade,
  comment_id uuid references public.comments (id) on delete cascade,
  file_path text not null,
  name text not null,
  size bigint,
  uploaded_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (task_id is not null or comment_id is not null)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('mention', 'assigned', 'tag_comment', 'task_changed')),
  task_id uuid references public.tasks (id) on delete cascade,
  comment_id uuid references public.comments (id) on delete cascade,
  actor_id uuid references public.profiles (id),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, read_at);

create table public.saved_views (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  filters jsonb not null default '[]'::jsonb,
  sort jsonb not null default '[]'::jsonb,
  visible_columns jsonb,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);

/* Row-level security: members only                                    */

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'projects', 'sections', 'project_statuses', 'tasks',
    'field_definitions', 'task_field_values', 'tags', 'task_tags',
    'tag_follows', 'comments', 'attachments', 'notifications', 'saved_views'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "members full access" on public.%I for all to authenticated using (public.is_member()) with check (public.is_member())',
      t
    );
  end loop;
end $$;

/* Tighten a few tables so people only change what is theirs. */
drop policy "members full access" on public.profiles;
create policy "members read profiles" on public.profiles
  for select to authenticated using (public.is_member());
create policy "update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy "members full access" on public.notifications;
create policy "read own notifications" on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy "update own notifications" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "members create notifications" on public.notifications
  for insert to authenticated with check (public.is_member());

drop policy "members full access" on public.tag_follows;
create policy "members read follows" on public.tag_follows
  for select to authenticated using (public.is_member());
create policy "manage own follows" on public.tag_follows
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

/* File storage for attachments (private bucket)                       */

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

create policy "members read attachments" on storage.objects
  for select to authenticated
  using (bucket_id = 'attachments' and public.is_member());
create policy "members upload attachments" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments' and public.is_member());
create policy "members delete attachments" on storage.objects
  for delete to authenticated
  using (bucket_id = 'attachments' and public.is_member());

/* Realtime: live updates between the two of you                       */

alter publication supabase_realtime add table
  public.tasks, public.comments, public.notifications;
