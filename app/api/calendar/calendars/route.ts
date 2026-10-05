import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GoogleAuthError, accessTokenFor, listCalendars } from "@/lib/gcal/api";

export const dynamic = "force-dynamic";

type PrefRow = {
  calendar_id: string;
  name: string;
  color: string | null;
  show: boolean;
  shared: boolean;
};

/* Lists the signed-in person's Google calendars and keeps their saved
   show/share choices in step with it. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: conn } = await supabase
    .from("google_connections")
    .select("refresh_token_enc")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!conn) {
    return NextResponse.json({ connected: false, calendars: [] });
  }

  let live;
  try {
    const access = await accessTokenFor(conn.refresh_token_enc as string);
    live = await listCalendars(access);
  } catch (e) {
    if (e instanceof GoogleAuthError) {
      return NextResponse.json({ connected: true, problem: e.kind, calendars: [] });
    }
    return NextResponse.json(
      { connected: true, problem: "unavailable", calendars: [] },
      { status: 502 }
    );
  }

  const { data: saved } = await supabase
    .from("calendar_prefs")
    .select("calendar_id,name,color,show,shared")
    .eq("user_id", user.id);
  const byId = new Map(((saved ?? []) as PrefRow[]).map((r) => [r.calendar_id, r]));

  const upserts = live.map((c) => {
    const existing = byId.get(c.id);
    return {
      user_id: user.id,
      calendar_id: c.id,
      name: c.name,
      color: c.color,
      show: existing ? existing.show : c.primary,
      shared: existing ? existing.shared : false,
    };
  });
  if (upserts.length) {
    await supabase.from("calendar_prefs").upsert(upserts, { onConflict: "user_id,calendar_id" });
  }

  const liveIds = new Set(live.map((c) => c.id));
  const stale = [...byId.keys()].filter((id) => !liveIds.has(id));
  if (stale.length) {
    await supabase
      .from("calendar_prefs")
      .delete()
      .eq("user_id", user.id)
      .in("calendar_id", stale);
  }

  return NextResponse.json({
    connected: true,
    calendars: upserts.map((u) => ({
      id: u.calendar_id,
      name: u.name,
      color: u.color,
      show: u.show,
      shared: u.shared,
    })),
  });
}
