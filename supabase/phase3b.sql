/*
  Jefi Records: phase 3b database update

  Stores each person's appearance choices (mode and colors) on their profile,
  so the look follows them across devices. Already applied by Claude through
  the Supabase connection. Safe to run again.
*/

alter table public.profiles
  add column if not exists appearance jsonb not null default '{}'::jsonb;
