/*
  Jefi Records: phase 11 database update

  Google Calendar. Each person can connect their own Google account. The
  refresh token is stored encrypted (the key lives only on the server), and
  each calendar has two switches: show it on my calendar, and share it with
  the other person. Already applied by Claude through the Supabase connection.
  Kept here as a record and for rebuilding from scratch.
*/

create table if not exists public.google_connections (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  refresh_token_enc text not null,
  connected_at timestamptz not null default now()
);

alter table public.google_connections enable row level security;

create policy "own google connection" on public.google_connections
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.calendar_prefs (
  user_id uuid not null references public.profiles (id) on delete cascade,
  calendar_id text not null,
  name text not null,
  color text,
  show boolean not null default true,
  shared boolean not null default false,
  primary key (user_id, calendar_id)
);

alter table public.calendar_prefs enable row level security;

create policy "read own or shared calendars" on public.calendar_prefs
  for select using (
    user_id = auth.uid() or (shared and public.is_member())
  );

create policy "add own calendars" on public.calendar_prefs
  for insert with check (user_id = auth.uid());

create policy "change own calendars" on public.calendar_prefs
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "remove own calendars" on public.calendar_prefs
  for delete using (user_id = auth.uid());

/* Lets the server read the other person's (still encrypted) token, but only
   when they have shared at least one calendar. The browser never sees a usable
   token because the decryption key is not available to it. */

create or replace function public.shared_calendar_token(owner uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select c.refresh_token_enc
  from public.google_connections c
  where c.user_id = owner
    and public.is_member()
    and exists (
      select 1 from public.calendar_prefs p
      where p.user_id = owner and p.shared
    );
$$;

revoke all on function public.shared_calendar_token(uuid) from public, anon;
grant execute on function public.shared_calendar_token(uuid) to authenticated;
