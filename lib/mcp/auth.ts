import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/* The connector acts as the person who approved it. Every request carries
   their access token, so the database rules (private projects included) apply
   exactly as they do in the app. */

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function clientFor(token: string): SupabaseClient {
  return createClient(URL_, KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export type Verified = { token: string; userId: string; email: string };

export async function verifyBearer(token: string | undefined): Promise<Verified | null> {
  if (!token) return null;
  const { data, error } = await clientFor(token).auth.getUser(token);
  if (error || !data.user) return null;
  return { token, userId: data.user.id, email: data.user.email ?? "" };
}
