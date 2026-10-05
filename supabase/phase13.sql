/*
  Jefi Records: phase 13 database update

  1. Table settings per person and project: which columns show, their order,
     pinned columns, widths and row height. Each person only ever sees and
     changes their own row. (project_prefs already holds the sidebar order,
     so this is a separate table.)
  2. A project-wide name for the group that holds tasks without a section
     (called "Tasks" by default). Either person can rename it.

  Already applied by Claude through the Supabase connection. Kept here as a
  record and for rebuilding from scratch.
*/

create table if not exists public.project_table_prefs (
  user_id uuid not null references public.profiles (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  hidden text[] not null default '{status,assignee,tags}',
  col_order text[] not null default '{}',
  pinned text[] not null default '{}',
  widths jsonb not null default '{}'::jsonb,
  row_height text not null default 'large'
    check (row_height in ('compact', 'large')),
  updated_at timestamptz not null default now(),
  primary key (user_id, project_id)
);

alter table public.project_table_prefs enable row level security;

create policy "own table prefs" on public.project_table_prefs
  for all
  using (public.is_member() and user_id = auth.uid())
  with check (user_id = auth.uid() and public.can_access_project(project_id));

alter table public.projects
  add column if not exists default_section_name text not null default 'Tasks';

create or replace function public.rename_default_section(pid uuid, new_name text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null or not public.can_access_project(pid) then
    raise exception 'not allowed';
  end if;
  if new_name is null or length(btrim(new_name)) = 0 then
    raise exception 'name required';
  end if;
  update public.projects
    set default_section_name = left(btrim(new_name), 120)
    where id = pid;
end;
$$;

revoke all on function public.rename_default_section(uuid, text) from public, anon;
grant execute on function public.rename_default_section(uuid, text) to authenticated;
