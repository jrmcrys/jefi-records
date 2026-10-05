/*
  Jefi Records: phase 6 database update

  Live updates for custom columns and tags, and repeating tasks now carry over
  their tags and custom column values. The tables themselves came from the
  first schema. Already applied by Claude through the Supabase connection.
*/

alter publication supabase_realtime add table
  public.field_definitions, public.task_field_values, public.tags,
  public.task_tags, public.tag_follows;

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

  insert into public.task_tags (task_id, tag_id)
    select new_id, tag_id from public.task_tags where task_id = new.id;

  insert into public.task_field_values (task_id, field_id, value)
    select new_id, field_id, value from public.task_field_values
    where task_id = new.id;

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

