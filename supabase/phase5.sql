/*
  Jefi Records: phase 5 database update

  Repeating tasks. When a repeating task is completed, the database creates the
  next copy (same name, description, assignee, subtasks) with the next due
  date, and logs a "duplicated" event on the finished task. Already applied by
  Claude through the Supabase connection. Kept here as a record and for
  rebuilding from scratch.

  recurrence looks like:
    {"freq":"daily|weekly|monthly|yearly","interval":1,"days":[1,3],
     "until":"2027-01-31","tz":"Asia/Manila"}
  days uses 0 for Sunday through 6 for Saturday and only applies to weekly.
*/

create or replace function public.recurrence_step(local_ts timestamp, rec jsonb)
returns timestamp
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  freq text := rec->>'freq';
  n int := greatest(coalesce((rec->>'interval')::int, 1), 1);
  dow int;
  days int[];
  later int;
begin
  if freq = 'daily' then
    return local_ts + make_interval(days => n);
  elsif freq = 'weekly' then
    select coalesce(array_agg(distinct d::int order by d::int), '{}')
      into days
      from jsonb_array_elements_text(coalesce(rec->'days', '[]'::jsonb)) as d;
    if cardinality(days) = 0 then
      return local_ts + make_interval(days => 7 * n);
    end if;
    dow := extract(dow from local_ts)::int;
    select min(x) into later from unnest(days) as x where x > dow;
    if later is not null then
      return local_ts + make_interval(days => later - dow);
    end if;
    return local_ts + make_interval(days => 7 * n - dow + days[1]);
  elsif freq = 'monthly' then
    return local_ts + make_interval(months => n);
  elsif freq = 'yearly' then
    return local_ts + make_interval(years => n);
  end if;
  return null;
end;
$$;

create or replace function public.next_due_at(due timestamptz, rec jsonb)
returns timestamptz
language plpgsql
stable
set search_path to 'public'
as $$
declare
  tz text := coalesce(nullif(rec->>'tz', ''), 'UTC');
  local_ts timestamp;
  today date;
  until_d date;
  i int := 0;
begin
  if due is null or rec is null or rec->>'freq' is null then
    return null;
  end if;
  begin
    perform now() at time zone tz;
  exception when others then
    tz := 'UTC';
  end;
  local_ts := due at time zone tz;
  today := (now() at time zone tz)::date;
  until_d := nullif(rec->>'until', '')::date;
  loop
    local_ts := public.recurrence_step(local_ts, rec);
    i := i + 1;
    exit when local_ts is null or local_ts::date >= today or i > 6000;
  end loop;
  if local_ts is null or i > 6000 then
    return null;
  end if;
  if until_d is not null and local_ts::date > until_d then
    return null;
  end if;
  return local_ts at time zone tz;
end;
$$;

create or replace function public.spawn_next_recurrence()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  next_due timestamptz;
  open_status uuid;
  new_id uuid;
  actor uuid := coalesce(auth.uid(), old.created_by);
  kid record;
begin
  if old.completed_at is not null or new.completed_at is null then
    return new;
  end if;
  if new.recurrence is null or new.due_at is null or new.parent_task_id is not null then
    return new;
  end if;

  next_due := public.next_due_at(new.due_at, new.recurrence);
  if next_due is null then
    return new;
  end if;

  if exists (
    select 1 from public.tasks t
    where t.project_id = new.project_id and t.parent_task_id is null
      and t.name = new.name and t.completed_at is null
      and t.due_at = next_due and t.id <> new.id
      and t.recurrence is not distinct from new.recurrence
  ) then
    return new;
  end if;

  select id into open_status from public.project_statuses
    where project_id = new.project_id and not is_done
    order by position limit 1;

  insert into public.tasks (
    project_id, section_id, name, description, status_id, assignee_id,
    due_at, due_has_time, recurrence, position, created_by
  ) values (
    new.project_id, new.section_id, new.name, new.description, open_status,
    new.assignee_id, next_due, new.due_has_time, new.recurrence,
    new.position, actor
  ) returning id into new_id;

  for kid in
    select * from public.tasks where parent_task_id = new.id order by position
  loop
    insert into public.tasks (
      project_id, section_id, parent_task_id, name, description, status_id,
      assignee_id, position, created_by
    ) values (
      kid.project_id, new.section_id, new_id, kid.name, kid.description,
      open_status, kid.assignee_id, kid.position, actor
    );
  end loop;

  insert into public.task_activity (task_id, actor_id, type, data)
  values (new.id, actor, 'duplicated',
    jsonb_build_object('due', next_due, 'next_task_id', new_id));

  return new;
end;
$$;

create or replace trigger tasks_spawn_recurrence
  after update on public.tasks
  for each row execute function public.spawn_next_recurrence();
