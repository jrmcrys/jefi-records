/*
  Jefi Records: phase 10 database update

  Per-project colors. The owner picks accent, background and text colors for a
  project and decides whether the other person sees them. Only the owner can
  change these columns, because the existing "owner updates project" rule
  already limits every update on projects to its creator.
  Already applied by Claude through the Supabase connection. Kept here as a
  record and for rebuilding from scratch.
*/

alter table public.projects
  add column if not exists appearance jsonb not null default '{}'::jsonb,
  add column if not exists appearance_shared boolean not null default false;
