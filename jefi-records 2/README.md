# Jefi Records

A subscription-free shared task manager for two. Next.js on Vercel, Supabase for the database and login.

Status: phase 1 (foundation). Magic link login, two profiles, full database schema, installable web app.

## Setup order

1. Put this folder on GitHub (new repository named jefi-records).
2. In Supabase, run `supabase/schema.sql` in the SQL Editor.
3. In Supabase, update the Magic Link email template and the URL settings (details below).
4. In Vercel, import the GitHub repository and add the two environment variables.
5. Come back to Supabase and set the Site URL to your Vercel URL.

## Supabase steps

Run the schema: SQL Editor, New query, paste all of `supabase/schema.sql`, Run.

Find your keys: Project Settings, API Keys. Copy the Project URL and the publishable key (older projects call it the anon key).

Email template: Authentication, Email Templates, Magic Link. Replace the link in the body with:

    <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Sign in to Jefi Records</a></p>

This makes the link work on any device, so a link requested on the Mac opens fine on the iPhone.

URL settings: Authentication, URL Configuration.
- Site URL: your Vercel URL (for example https://jefi-records.vercel.app)
- Redirect URLs: add the same URL followed by `/**`, and `http://localhost:3000/**` if you test locally

## Vercel steps

Add New Project, import the jefi-records repository, and under Environment Variables add:

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY

Deploy. The framework preset is detected automatically.

## Local development

    cp .env.example .env.local   # fill in the two values
    npm install
    npm run dev

Open http://localhost:3000.

## Installing on devices

- Mac (Chrome): open the site, then the install icon in the address bar. Safari: File, Add to Dock.
- iPhone (Safari): Share, Add to Home Screen.
