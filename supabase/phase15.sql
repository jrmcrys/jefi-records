/*
  Jefi Records: phase 15 database update

  Header (cover) images. A project's cover is stored on the project and
  shows for everyone who can see it; only the owner changes it (the existing
  "owner updates project" rule covers this). Covers on Home, Inbox, My tasks,
  Docs, Sheets and Settings are personal and live in profiles.personal
  (no database change needed). Uploaded cover pictures go into the existing
  public "icons" bucket under covers/<user id>/ and projects/<id>/covers/.

  Applied by Claude through the Supabase connection. Kept here as a record.
*/

alter table public.projects add column if not exists cover jsonb;
