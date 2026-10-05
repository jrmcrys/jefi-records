/*
  Jefi Records: phase 7 database update

  Saved views remember how a project list is grouped, next to the filters and
  sort that the first schema already stored. Already applied by Claude through
  the Supabase connection.

  saved_views.filters holds the filter settings (an object), saved_views.sort
  holds {"key":"due","dir":"asc"}, and saved_views.group_by holds one of
  sections, due, assignee, status, created, completed, tag.
*/

alter table public.saved_views add column if not exists group_by text not null default 'sections';

alter publication supabase_realtime add table public.saved_views;
