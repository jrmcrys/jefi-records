/*
  Jefi Records: phase 14 database update

  1. profiles.personal: each person's own settings (which sidebar pages show,
     intro texts, background music). Only that person can change them.
  2. projects.image_url and projects.emoji: the picture for a project.
  3. app_settings: one shared row holding the logo shown beside "Jefi Records".
  4. Storage: a public "icons" bucket for logos and project pictures, and a
     private "music" bucket for each person's uploaded song.

  Applied by Claude through the Supabase connection. Kept here as a record.
*/

alter table public.profiles
  add column if not exists personal jsonb not null default '{}'::jsonb;

alter table public.projects
  add column if not exists image_url text,
  add column if not exists emoji text;

create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  logo_url text,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id) values (1) on conflict (id) do nothing;

alter table public.app_settings enable row level security;

create policy "members read app settings" on public.app_settings
  for select using (public.is_member());

create policy "members update app settings" on public.app_settings
  for update using (public.is_member()) with check (public.is_member());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'icons', 'icons', true, 2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "members list icons" on storage.objects
  for select using (bucket_id = 'icons' and public.is_member());

create policy "members upload icons" on storage.objects
  for insert with check (bucket_id = 'icons' and public.is_member());

create policy "members delete icons" on storage.objects
  for delete using (bucket_id = 'icons' and public.is_member());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'music', 'music', false, 31457280,
  array['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/ogg']
)
on conflict (id) do nothing;

create policy "read own music" on storage.objects
  for select using (
    bucket_id = 'music' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "upload own music" on storage.objects
  for insert with check (
    bucket_id = 'music'
    and public.is_member()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "delete own music" on storage.objects
  for delete using (
    bucket_id = 'music' and (storage.foldername(name))[1] = auth.uid()::text
  );
