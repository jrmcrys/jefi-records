/*
  Jefi Records: phase 4 database update

  Adds the task activity log, "seen by" receipts, and project-aware rules for
  file attachments. Already applied by Claude through the Supabase connection.
  Kept here as a record and for rebuilding from scratch.
*/

/* Activity log. Rows are written by triggers and functions only. */

create table if not exists public.task_activity (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  type text not null check (type in (
    'created', 'renamed', 'status', 'assignee', 'due', 'completed',
    'reopened', 'description', 'attachment', 'viewed', 'duplicated'
  )),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists task_activity_task_idx
  on public.task_activity (task_id, created_at);

alter table public.task_activity enable row level security;

create policy "read task activity" on public.task_activity
  for select using (public.can_access_task(task_id));

/* Last time each person opened each task. */

create table if not exists public.task_views (
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

alter table public.task_views enable row level security;

create policy "read task views" on public.task_views
  for select using (public.can_access_task(task_id));

create or replace function public.mark_task_seen(tid uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null or not public.can_access_task(tid) then
    return;
  end if;

  insert into public.task_views (task_id, user_id, last_seen_at)
  values (tid, auth.uid(), now())
  on conflict (task_id, user_id) do update set last_seen_at = now();

  if not exists (
    select 1 from public.task_activity
    where task_id = tid and actor_id = auth.uid() and type = 'viewed'
      and created_at > now() - interval '30 minutes'
  ) then
    insert into public.task_activity (task_id, actor_id, type)
    values (tid, auth.uid(), 'viewed');
  end if;
end;
$$;

revoke all on function public.mark_task_seen(uuid) from public, anon;
grant execute on function public.mark_task_seen(uuid) to authenticated;

/* Log changes to tasks. */

create or replace function public.log_task_changes()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into public.task_activity (task_id, actor_id, type, data)
    values (
      new.id, actor, 'created',
      jsonb_build_object('subtask', new.parent_task_id is not null)
    );
    return new;
  end if;

  if new.name is distinct from old.name then
    insert into public.task_activity (task_id, actor_id, type, data)
    values (new.id, actor, 'renamed',
      jsonb_build_object('from', old.name, 'to', new.name));
  end if;

  if new.status_id is distinct from old.status_id then
    insert into public.task_activity (task_id, actor_id, type, data)
    values (new.id, actor, 'status', jsonb_build_object(
      'from', (select name from public.project_statuses where id = old.status_id),
      'to', (select name from public.project_statuses where id = new.status_id)
    ));
  end if;

  if new.assignee_id is distinct from old.assignee_id then
    insert into public.task_activity (task_id, actor_id, type, data)
    values (new.id, actor, 'assignee', jsonb_build_object(
      'from', (select name from public.profiles where id = old.assignee_id),
      'to', (select name from public.profiles where id = new.assignee_id)
    ));
  end if;

  if new.due_at is distinct from old.due_at then
    insert into public.task_activity (task_id, actor_id, type, data)
    values (new.id, actor, 'due',
      jsonb_build_object('from', old.due_at, 'to', new.due_at));
  end if;

  if old.completed_at is null and new.completed_at is not null then
    insert into public.task_activity (task_id, actor_id, type)
    values (new.id, actor, 'completed');
  elsif old.completed_at is not null and new.completed_at is null then
    insert into public.task_activity (task_id, actor_id, type)
    values (new.id, actor, 'reopened');
  end if;

  if new.description is distinct from old.description and not exists (
    select 1 from public.task_activity
    where task_id = new.id and actor_id is not distinct from actor
      and type = 'description'
      and created_at > now() - interval '10 minutes'
  ) then
    insert into public.task_activity (task_id, actor_id, type)
    values (new.id, actor, 'description');
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_log_changes on public.tasks;
create trigger tasks_log_changes
  after insert or update on public.tasks
  for each row execute function public.log_task_changes();

create or replace function public.log_attachment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.task_id is not null then
    insert into public.task_activity (task_id, actor_id, type, data)
    values (new.task_id, auth.uid(), 'attachment',
      jsonb_build_object('name', new.name, 'comment_id', new.comment_id));
  end if;
  return new;
end;
$$;

drop trigger if exists attachments_log on public.attachments;
create trigger attachments_log
  after insert on public.attachments
  for each row execute function public.log_attachment();

/* Attachments: files live in a folder named after their task, and the same
   project rules decide who can read, add, or remove them. */

create or replace function public.can_access_attachment_path(p text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  tid uuid;
begin
  begin
    tid := split_part(p, '/', 1)::uuid;
  exception when others then
    return false;
  end;
  return public.can_access_task(tid);
end;
$$;

drop policy if exists "members read attachments" on storage.objects;
drop policy if exists "members upload attachments" on storage.objects;
drop policy if exists "members delete attachments" on storage.objects;

create policy "read project attachments" on storage.objects
  for select using (
    bucket_id = 'attachments' and public.can_access_attachment_path(name)
  );

create policy "upload project attachments" on storage.objects
  for insert with check (
    bucket_id = 'attachments' and public.can_access_attachment_path(name)
  );

create policy "delete project attachments" on storage.objects
  for delete using (
    bucket_id = 'attachments' and public.can_access_attachment_path(name)
  );

update storage.buckets set file_size_limit = 26214400 where id = 'attachments';

/* Live updates in the task panel. */

alter publication supabase_realtime add table
  public.task_activity, public.task_views, public.attachments;
