"use client";

import { useEffect, useState } from "react";
import type { CalEvent } from "./calendar";

export type EventRange = { from: string; to: string };

/* Loads Google Calendar events for the visible range. Shows nothing when
   Google is not connected, and keeps the last events on screen while a new
   range loads. */
export function useGoogleEvents(range: EventRange | null): CalEvent[] {
  const [events, setEvents] = useState<CalEvent[]>([]);

  useEffect(() => {
    if (!range) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const query = new URLSearchParams({ from: range.from, to: range.to });
        const res = await fetch(`/api/calendar/events?${query}`);
        if (!res.ok) return;
        const json = (await res.json()) as { events?: CalEvent[] };
        if (!cancelled) setEvents(json.events ?? []);
      } catch {
        /* The calendar still works without Google events. */
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [range]);

  return events;
}
