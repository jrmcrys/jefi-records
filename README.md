# Jefi Records

A subscription-free shared project and task manager for two people. Next.js on Vercel, Supabase for the database and sign-in.

What it does: projects (shared or private) with sections, subtasks, custom columns, tags, due dates and repeating tasks; a task panel with rich description, comments, files and activity; list, board-style grouping, saved views, My tasks, and a calendar (day, week, month, year) that can show Google Calendar events; Docs and Sheets link pages; an inbox with push notifications; per-person appearance and per-project colors; a data export; and a connector so Claude can read and update tasks.

## Setup order

1. Put this folder on GitHub (repository `jefi-records`). Vercel deploys from `main`.
2. In Supabase, run the SQL files in the order listed under "Database".
3. Set the Supabase URL settings and email template.
4. Add the environment variables in Vercel, then redeploy.
5. Optional: Google sign-in and calendar, push notifications, the Claude connector. Each has its own section below.

## Database

Run these in the Supabase SQL Editor, in this order, each once:

`schema.sql`, `phase2.sql`, `phase3.sql`, `phase3b.sql`, `phase4.sql`, `phase5.sql`, `phase6.sql`, `phase7.sql`, `phase9.sql`, `phase10.sql`, `phase11.sql`, `phase12.sql`, `phase13.sql`, `phase14.sql`, `phase15.sql`, `phase16.sql`.

`phase4.sql` ends with a "part B" that swaps the attachment storage rules and sets a 25 MB file limit. Some automated tools refuse to run it because it drops a policy, so paste that part into the SQL Editor yourself. Until it runs, files are readable by anyone signed in who knows the exact file path.

Invitations: only emails in the `allowed_emails` table can sign in, by any method. A database trigger on `auth.users` enforces it.

## Supabase settings

Find your keys: Project Settings, API Keys. Copy the Project URL and the publishable key.

Email template: Authentication, Email Templates, Magic Link. Replace the link in the body with:

    <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Sign in to Jefi Records</a></p>

URL settings: Authentication, URL Configuration.
- Site URL: your Vercel URL.
- Redirect URLs: the same URL followed by `/**`, and `http://localhost:3000/**` for local work.

## Environment variables

Set these in Vercel (Project Settings, Environment Variables). `NEXT_PUBLIC_` values are baked in at build time, so redeploy after changing them. See `.env.example` for the full list.

- Everything: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Google Calendar events: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_KEY`
- Push notifications: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PUSH_WEBHOOK_SECRET`

## Google sign-in and Google Calendar

1. In Google Cloud, create a project and enable the Google Calendar API.
2. OAuth consent screen: External. Scopes `openid`, `email`, `profile`, and `https://www.googleapis.com/auth/calendar.readonly`. Publish the app to "In production". An app left in "Testing" makes Google expire the calendar access after 7 days. Unverified is fine for two people.
3. Credentials: create an OAuth client of type Web application. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
4. Paste the client ID and secret into Supabase (Authentication, Providers, Google) and into the two Vercel variables.
5. Create `GOOGLE_TOKEN_KEY` with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. It encrypts the stored Google refresh tokens. Losing it means reconnecting Google.

Each person must use the Google account whose email matches their Jefi Records email.

## Browse Google Drive on the Docs and Sheets pages (optional)

The "Browse Google Drive" button appears once these three are set in Vercel, then redeploy:

- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`: the same OAuth client ID as `GOOGLE_CLIENT_ID`.
- `NEXT_PUBLIC_GOOGLE_API_KEY`: in Google Cloud, APIs and Services, Credentials, Create credentials, API key. Restrict it to the Google Picker API and to your site address.
- `NEXT_PUBLIC_GOOGLE_APP_ID`: the project number shown on the Google Cloud dashboard.

Also in Google Cloud: enable the Google Picker API and the Google Drive API, add your site address (for example `https://jefi-records-sg8y.vercel.app`) under Authorized JavaScript origins on the OAuth client, and add the scope `https://www.googleapis.com/auth/drive.file` to the consent screen. That scope only covers files you pick.

## Push notifications

1. `npx web-push generate-vapid-keys`, then set the three VAPID variables.
2. Pick a long random `PUSH_WEBHOOK_SECRET` and set it in Vercel and as the Supabase Vault secret `push_webhook_secret`. Store the full address of `/api/push/send` as the Vault secret `push_webhook_url`. `supabase/phase12.sql` explains both.
3. Each person turns notifications on per device in Settings. On iPhone the app must first be added to the Home Screen (iOS 16.4 or later).

## Claude connector

The app exposes a remote MCP server at `/api/mcp`. Claude signs in through your Supabase project (Supabase acts as the OAuth server) and every call runs as that person, so private projects stay private.

1. Supabase: Authentication, OAuth Server. Turn it on, set the Authorization Path to `/oauth/consent`, and enable dynamic client registration.
2. Recommended: move the project to asymmetric JWT signing keys (Project Settings, JWT Keys) so tokens verify cleanly.
3. In Claude: Settings, Connectors, add a custom connector with the URL `https://<your-app>/api/mcp`. Approve on the page that opens.

Tools: list and search tasks, read a task with its comments, create tasks and subtasks, update, complete, tag, comment, and create projects and sections.

## Local development

    cp .env.example .env.local   # fill in the values
    npm install
    npm run dev

Open http://localhost:3000. Checks: `npm run lint` and `npm run build`.

## Installing on devices

- Mac (Chrome): open the site, then the install icon in the address bar. Safari: File, Add to Dock.
- iPhone (Safari): Share, Add to Home Screen.

## Known limits

- Tags are shared across all projects.
- Monthly repeats on the 29th to 31st drift to shorter months.
- Calendar dragging works with a mouse only.
- Google events show on project calendar views only, and private events on a shared calendar appear as Busy.
- Saved views belong to the project. Link order is per person.
- Docs and Sheets pages link to Google files. Google can refuse to show some files inside the page.
- The sidebar width and whether it is hidden are saved per device. Page covers are personal; a project's cover is shared and only its owner changes it.
- Connector dates without a time are stored at 12:00 UTC. Times without an offset are read as +08:00.
