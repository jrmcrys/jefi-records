"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type CalendarRow = {
  id: string;
  name: string;
  color: string | null;
  show: boolean;
  shared: boolean;
};

type Loaded = {
  connected: boolean;
  problem?: "expired" | "scope" | "config" | "unavailable";
  calendars: CalendarRow[];
};

const PROBLEMS: Record<NonNullable<Loaded["problem"]>, string> = {
  expired:
    "Google stopped accepting this connection. Press Reconnect to fix it.",
  scope:
    "Calendar permission was not granted. Press Reconnect and keep the calendar box ticked on Google's screen.",
  config:
    "Google sign-in is not fully set up on the server yet, so calendars cannot load.",
  unavailable: "Google Calendar could not be reached. Try again in a minute.",
};

export default function GoogleCalendarSettings({
  userId,
  otherName,
  showShared,
  onShowShared,
}: {
  userId: string;
  otherName: string;
  showShared: boolean;
  onShowShared: (value: boolean) => void;
}) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/calendar/calendars", { cache: "no-store" });
      const json = (await res.json()) as Loaded;
      setData({
        connected: Boolean(json.connected),
        problem: json.problem,
        calendars: json.calendars ?? [],
      });
    } catch {
      setData({ connected: false, problem: "unavailable", calendars: [] });
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function connect() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/settings`,
        scopes: "https://www.googleapis.com/auth/calendar.readonly",
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
    if (error) {
      setBusy(false);
      setError(error.message);
    }
  }

  async function disconnect() {
    if (
      !window.confirm(
        "Disconnect Google Calendar? Events stop appearing for you, and any calendars you shared stop appearing for " +
          otherName +
          "."
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/calendar/disconnect", { method: "POST" });
      if (!res.ok) throw new Error("Disconnecting failed. Try again.");
      setData({ connected: false, calendars: [] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Disconnecting failed.");
    }
    setBusy(false);
  }

  async function setFlag(id: string, flag: "show" | "shared", value: boolean) {
    setError(null);
    setData((d) =>
      d
        ? {
            ...d,
            calendars: d.calendars.map((c) =>
              c.id === id ? { ...c, [flag]: value } : c
            ),
          }
        : d
    );
    const supabase = createClient();
    const { error } = await supabase
      .from("calendar_prefs")
      .update({ [flag]: value })
      .eq("user_id", userId)
      .eq("calendar_id", id);
    if (error) {
      setError(error.message);
      load();
    }
  }

  return (
    <section className="mt-8">
      <h2 className="text-sm font-medium">Google Calendar</h2>
      <p className="mt-1 text-xs opacity-60">
        Events appear read-only on project calendars. Choose which calendars you
        see, and which ones {otherName} may also see. Private events on a shared
        calendar show up to {otherName} as Busy.
      </p>

      {data === null && <p className="mt-3 text-sm opacity-60">Loading...</p>}

      {data && !data.connected && (
        <div className="mt-3">
          {data.problem && (
            <p role="alert" className="mb-3 text-sm text-amber-600">
              {PROBLEMS[data.problem]}
            </p>
          )}
          <button
            type="button"
            onClick={connect}
            disabled={busy}
            className="rounded-md border border-current/30 px-3 py-2 text-sm font-medium hover:bg-current/5 disabled:opacity-60"
          >
            {busy ? "Opening Google..." : "Connect Google Calendar"}
          </button>
          <p className="mt-2 text-xs opacity-60">
            Use the Google account that has the same email address as your
            Jefi Records sign-in.
          </p>
        </div>
      )}

      {data?.connected && (
        <div className="mt-3">
          {data.problem && (
            <p role="alert" className="mb-3 text-sm text-amber-600">
              {PROBLEMS[data.problem]}
            </p>
          )}

          {data.calendars.length > 0 && (
            <ul className="divide-y divide-current/10 rounded-lg border border-current/15">
              <li className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-3 py-2 text-xs opacity-60">
                <span>Calendar</span>
                <span className="w-16 text-center">Show</span>
                <span className="w-16 text-center">Share</span>
              </li>
              {data.calendars.map((c) => (
                <li
                  key={c.id}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-3 py-2"
                >
                  <span className="flex min-w-0 items-center gap-2 text-sm">
                    <span
                      aria-hidden="true"
                      className="size-3 shrink-0 rounded-full"
                      style={{ backgroundColor: c.color ?? "#4285f4" }}
                    />
                    <span className="truncate">{c.name}</span>
                  </span>
                  <span className="flex w-16 justify-center">
                    <input
                      type="checkbox"
                      checked={c.show}
                      aria-label={`Show ${c.name} on my calendar`}
                      onChange={(e) => setFlag(c.id, "show", e.target.checked)}
                      className="size-4 accent-accent"
                    />
                  </span>
                  <span className="flex w-16 justify-center">
                    <input
                      type="checkbox"
                      checked={c.shared}
                      aria-label={`Share ${c.name} with ${otherName}`}
                      onChange={(e) => setFlag(c.id, "shared", e.target.checked)}
                      className="size-4 accent-accent"
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}

          <label className="mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showShared}
              onChange={(e) => onShowShared(e.target.checked)}
              className="size-4 accent-accent"
            />
            Show the calendars {otherName} shares with me
          </label>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={connect}
              disabled={busy}
              className="rounded-md border border-current/30 px-3 py-2 text-sm hover:bg-current/5 disabled:opacity-60"
            >
              Reconnect
            </button>
            <button
              type="button"
              onClick={disconnect}
              disabled={busy}
              className="rounded-md px-3 py-2 text-sm underline opacity-70 hover:opacity-100 disabled:opacity-40"
            >
              Disconnect
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-500">
          {error}
        </p>
      )}
    </section>
  );
}
