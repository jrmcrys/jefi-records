/*
  Jefi Records: phase 12 database update

  Notifications. Rows are created by triggers, so they work the same whether a
  change comes from the app or from the Claude connector.

    mention       someone mentioned you in a comment
    assigned      someone assigned a task to you
    tag_comment   a new comment on a task that has a tag you follow
    task_changed  a followed tag was added to a task, or someone commented on a
                  task assigned to you (data.kind says which)

  Each person can switch the four groups on or off in Settings
  (profiles.prefs.notify). Push delivery to phones and Macs is Part B below.
  Already applied by Claude through the Supabase connection. Kept here as a
  record and for rebuilding from scratch.
*/

/* Part A: inbox rows */

alter table public.notifications
  add column if not exists data jsonb not null default '{}'::jsonb;

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);

create or replace function public.user_can_see_project(uid uuid, pid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.projects p
    join public.profiles me on me.id = uid
    where p.id = pid
      and exists (select 1 from public.allowed_emails a where a.email = lower(me.email))
      and (p.visibility = 'public' or p.created_by = uid)
  );
$$;

revoke all on function public.user_can_see_project(uuid, uuid) from public, anon, authenticated;

/* kind is one of: mentions, assigned, tags, comments. Missing means on. */
create or replace function public.wants_notification(uid uuid, kind text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select (p.prefs -> 'notify' ->> kind) is distinct from 'false'
     from public.profiles p where p.id = uid),
    true
  );
$$;

revoke all on function public.wants_notification(uuid, text) from public, anon, authenticated;

create or replace function public.notify_comment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  t record;
  uid uuid;
  snippet text;
  notified uuid[] := '{}';
  follower record;
begin
  select tk.project_id, tk.assignee_id into t
  from public.tasks tk where tk.id = new.task_id;
  if not found then
    return new;
  end if;

  snippet := left(btrim(regexp_replace(
    regexp_replace(coalesce(new.body, ''), '<[^>]+>', ' ', 'g'),
    '\s+', ' ', 'g')), 140);

  foreach uid in array coalesce(new.mentions, '{}'::uuid[]) loop
    if uid is distinct from new.author_id
       and not (uid = any (notified))
       and public.user_can_see_project(uid, t.project_id)
       and public.wants_notification(uid, 'mentions') then
      insert into public.notifications (user_id, type, task_id, comment_id, actor_id, data)
      values (uid, 'mention', new.task_id, new.id, new.author_id,
              jsonb_build_object('snippet', snippet));
      notified := notified || uid;
    end if;
  end loop;

  for follower in
    select distinct on (f.user_id) f.user_id as uid, g.name as tag_name
    from public.task_tags tt
    join public.tag_follows f on f.tag_id = tt.tag_id
    join public.tags g on g.id = tt.tag_id
    where tt.task_id = new.task_id
    order by f.user_id, g.name
  loop
    if follower.uid is distinct from new.author_id
       and not (follower.uid = any (notified))
       and public.user_can_see_project(follower.uid, t.project_id)
       and public.wants_notification(follower.uid, 'tags') then
      insert into public.notifications (user_id, type, task_id, comment_id, actor_id, data)
      values (follower.uid, 'tag_comment', new.task_id, new.id, new.author_id,
              jsonb_build_object('tag', follower.tag_name, 'snippet', snippet));
      notified := notified || follower.uid;
    end if;
  end loop;

  if t.assignee_id is not null
     and t.assignee_id is distinct from new.author_id
     and not (t.assignee_id = any (notified))
     and public.user_can_see_project(t.assignee_id, t.project_id)
     and public.wants_notification(t.assignee_id, 'comments') then
    insert into public.notifications (user_id, type, task_id, comment_id, actor_id, data)
    values (t.assignee_id, 'task_changed', new.task_id, new.id, new.author_id,
            jsonb_build_object('kind', 'comment', 'snippet', snippet));
  end if;

  return new;
end;
$$;

create or replace trigger comments_notify
  after insert on public.comments
  for each row execute function public.notify_comment();

create or replace function public.notify_assignment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  /* Skip rows made by another trigger, such as the next copy of a
     recurring task. */
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.assignee_id is not null
     and new.assignee_id is distinct from auth.uid()
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and public.user_can_see_project(new.assignee_id, new.project_id)
     and public.wants_notification(new.assignee_id, 'assigned') then
    insert into public.notifications (user_id, type, task_id, actor_id)
    values (new.assignee_id, 'assigned', new.id, auth.uid());
  end if;
  return new;
end;
$$;

create or replace trigger tasks_notify_assignment
  after insert or update of assignee_id on public.tasks
  for each row execute function public.notify_assignment();

create or replace function public.notify_tag_added()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  t record;
  tag_name text;
  follower record;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  select tk.project_id into t from public.tasks tk where tk.id = new.task_id;
  select g.name into tag_name from public.tags g where g.id = new.tag_id;
  if t.project_id is null then
    return new;
  end if;

  for follower in
    select f.user_id as uid from public.tag_follows f where f.tag_id = new.tag_id
  loop
    if follower.uid is distinct from auth.uid()
       and public.user_can_see_project(follower.uid, t.project_id)
       and public.wants_notification(follower.uid, 'tags') then
      insert into public.notifications (user_id, type, task_id, actor_id, data)
      values (follower.uid, 'task_changed', new.task_id, auth.uid(),
              jsonb_build_object('kind', 'tag', 'tag', tag_name));
    end if;
  end loop;
  return new;
end;
$$;

create or replace trigger task_tags_notify
  after insert on public.task_tags
  for each row execute function public.notify_tag_added();

/* One row per device that turned on push notifications. */

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "own push subscriptions" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

/* Part B: push delivery
   When a notification row appears, the database posts the message and the
   person's device subscriptions to the app's /api/push/send route, which signs
   and delivers it. The route address and shared secret live in Supabase Vault
   (names push_webhook_url and push_webhook_secret). Without them this trigger
   does nothing, so the inbox keeps working either way. */

create extension if not exists pg_net with schema extensions;

create or replace function public.push_on_notification()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  hook_url text;
  hook_secret text;
  subs jsonb;
  actor_name text;
  task_name text;
  proj uuid;
  title text;
  msg text;
begin
  select decrypted_secret into hook_url
    from vault.decrypted_secrets where name = 'push_webhook_url';
  select decrypted_secret into hook_secret
    from vault.decrypted_secrets where name = 'push_webhook_secret';
  if hook_url is null or hook_secret is null then
    return new;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
    into subs
    from public.push_subscriptions s where s.user_id = new.user_id;
  if jsonb_array_length(subs) = 0 then
    return new;
  end if;

  select p.name into actor_name from public.profiles p where p.id = new.actor_id;
  actor_name := coalesce(actor_name, 'Someone');
  select t.name, t.project_id into task_name, proj
    from public.tasks t where t.id = new.task_id;

  title := case new.type
    when 'mention' then actor_name || ' mentioned you'
    when 'assigned' then actor_name || ' assigned a task to you'
    when 'tag_comment' then actor_name || ' commented on a task tagged '
      || coalesce(new.data ->> 'tag', 'a tag you follow')
    else case when new.data ->> 'kind' = 'tag'
      then actor_name || ' added the tag ' || coalesce(new.data ->> 'tag', 'you follow')
      else actor_name || ' commented on your task' end
  end;

  msg := coalesce(task_name, '')
    || case when coalesce(new.data ->> 'snippet', '') <> ''
         then ': ' || (new.data ->> 'snippet') else '' end;

  perform net.http_post(
    url := hook_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', hook_secret),
    body := jsonb_build_object(
      'subscriptions', subs,
      'title', title,
      'body', left(msg, 180),
      'url', case when proj is not null
        then '/p/' || proj || '?task=' || new.task_id else '/inbox' end,
      'tag', new.id::text)
  );
  return new;
exception when others then
  return new;
end;
$$;

revoke all on function public.push_on_notification() from public, anon, authenticated;

create or replace trigger notifications_push
  after insert on public.notifications
  for each row execute function public.push_on_notification();

/* Run once, with your own values (Claude did this during setup):
   select vault.create_secret('https://YOUR-SITE/api/push/send', 'push_webhook_url');
   select vault.create_secret('THE-SAME-SECRET-AS-PUSH_WEBHOOK_SECRET', 'push_webhook_secret'); */
