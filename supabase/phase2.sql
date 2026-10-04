/*
  Jefi Records: phase 2 database update

  How to run: Supabase dashboard > SQL Editor > New query > paste > Run.
  Run it once. It turns on live updates for projects, sections and statuses,
  so changes made by one of you appear for the other without a refresh.
*/

alter publication supabase_realtime add table
  public.projects, public.sections, public.project_statuses;

/* Lets the app see which task was deleted in a live update. */
alter table public.tasks replica identity full;
