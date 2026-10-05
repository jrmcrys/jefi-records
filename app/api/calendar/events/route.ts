import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  GoogleAuthError,
  accessTokenFor,
  listEvents,
  type GoogleEvent,
} from "@/lib/gcal/api";
import type { CalEvent } from "@/lib/calendar";

export const dynamic = "force-dynamic";

type PrefRow = {
  user_id: string;
  calendar_id: string;
  name: string;
  color: string | null;
  show: boolean;
  shared: boolean;
};

const MAX_CALENDARS = 20;
const MAX_RANGE_DAYS = 400;

function toEvent(
  ev: GoogleEvent,
  pref: PrefRow,
  mine: boolean,
  ownerName: string
): CalEvent | null {
  if (ev.status === "cancelled") return null;
  if (mine && ev.attendees?.some((a) => a.self && a.responseStatus === "declined")) {
    return null;
  }
  const start = ev.start?.dateTime ?? ev.start?.date;
  if (!start) return null;
  const allDay = !ev.start?.dateTime;
  const hidden =
    !mine && (ev.visibility === "private" || ev.visibility === "confidential");
  return {
    id: `${pref.calendar_id}:${ev.id}`,
    title: hidden ? "Busy" : ev.summary?.trim() || "(No title)",
    start,
    end: ev.end?.dateTime ?? ev.end?.date ?? null,
    allDay,
    color: pref.color ?? "#4285f4",
    source: mine ? pref.name : `${ownerName}: ${pref.name}`,
  };
}

/* Events from the calendars the signed-in person chose to show, plus the
   calendars the other person chose to share (unless switched off). */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const from = new Date(params.get("from") ?? "");
  const to = new Date(params.get("to") ?? "");
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
    return NextResponse.json({ error: "Bad date range" }, { status: 400 });
  }
  if ((to.getTime() - from.getTime()) / 86_400_000 > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: "Range too long" }, { status: 400 });
  }

  const [{ data: prefsRows }, { data: me }, { data: people }] = await Promise.all([
    supabase
      .from("calendar_prefs")
      .select("user_id,calendar_id,name,color,show,shared"),
    supabase.from("profiles").select("prefs").eq("id", user.id).maybeSingle(),
    supabase.from("profiles").select("id,name"),
  ]);

  const showOthers =
    (me?.prefs as { showSharedCalendars?: boolean } | null)?.showSharedCalendars !== false;
  const nameOf = new Map(
    ((people ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name])
  );

  const wanted = ((prefsRows ?? []) as PrefRow[]).filter((r) =>
    r.user_id === user.id ? r.show : showOthers && r.shared
  );
  if (wanted.length === 0) {
    return NextResponse.json({ events: [] });
  }

  const byOwner = new Map<string, PrefRow[]>();
  for (const r of wanted.slice(0, MAX_CALENDARS)) {
    byOwner.set(r.user_id, [...(byOwner.get(r.user_id) ?? []), r]);
  }

  const events: CalEvent[] = [];
  const problems: string[] = [];

  await Promise.all(
    [...byOwner.entries()].map(async ([ownerId, rows]) => {
      const mine = ownerId === user.id;
      const ownerName = nameOf.get(ownerId) ?? "Shared";
      let stored: string | null = null;
      if (mine) {
        const { data } = await supabase
          .from("google_connections")
          .select("refresh_token_enc")
          .eq("user_id", user.id)
          .maybeSingle();
        stored = (data?.refresh_token_enc as string | undefined) ?? null;
      } else {
        const { data } = await supabase.rpc("shared_calendar_token", { owner: ownerId });
        stored = (data as string | null) ?? null;
      }
      if (!stored) return;

      try {
        const access = await accessTokenFor(stored);
        const lists = await Promise.all(
          rows.map(async (pref) => {
            try {
              const items = await listEvents(
                access,
                pref.calendar_id,
                from.toISOString(),
                to.toISOString()
              );
              return items
                .map((ev) => toEvent(ev, pref, mine, ownerName))
                .filter((e): e is CalEvent => e !== null);
            } catch {
              problems.push(pref.name);
              return [];
            }
          })
        );
        for (const l of lists) events.push(...l);
      } catch (e) {
        problems.push(e instanceof GoogleAuthError ? e.kind : "unavailable");
      }
    })
  );

  return NextResponse.json({ events, problems });
}
