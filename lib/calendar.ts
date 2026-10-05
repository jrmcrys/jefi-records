import type { Task } from "./types";

/* Calendar maths. Weeks run Monday to Sunday. Dates are handled in the
   browser's local time zone. */

export type CalendarMode = "day" | "week" | "month" | "year";

export type CalEvent = {
  id: string;
  title: string;
  /** ISO moment for timed events, YYYY-MM-DD for all-day events. */
  start: string;
  /** Exclusive end date (YYYY-MM-DD) for all-day events, ISO moment otherwise. */
  end?: string | null;
  allDay: boolean;
  color: string;
  source: string;
};

const pad = (n: number) => String(n).padStart(2, "0");

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function addMonths(d: Date, n: number): Date {
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), last));
}

export function startOfWeek(d: Date): Date {
  return addDays(startOfDay(d), -((d.getDay() + 6) % 7));
}

export function weekDays(d: Date): Date[] {
  const start = startOfWeek(d);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Six full weeks that cover the month, starting on a Monday. */
export function monthGrid(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1);
  const start = startOfWeek(first);
  return Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i))
  );
}

export function sameDay(a: Date, b: Date): boolean {
  return dateKey(a) === dateKey(b);
}

export function hourLabel(h: number): string {
  if (h === 0 || h === 24) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function titleFor(mode: CalendarMode, d: Date): string {
  switch (mode) {
    case "day":
      return d.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    case "week": {
      const days = weekDays(d);
      const a = days[0];
      const b = days[6];
      const sameMonth = a.getMonth() === b.getMonth();
      const month = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });
      const left = `${month(a)} ${a.getDate()}`;
      const right = sameMonth
        ? `${b.getDate()}, ${b.getFullYear()}`
        : `${month(b)} ${b.getDate()}, ${b.getFullYear()}`;
      return `${left} to ${right}`;
    }
    case "month":
      return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    case "year":
      return String(d.getFullYear());
  }
}

export function stepDate(mode: CalendarMode, d: Date, dir: -1 | 1): Date {
  switch (mode) {
    case "day":
      return addDays(d, dir);
    case "week":
      return addDays(d, dir * 7);
    case "month":
      return addMonths(d, dir);
    case "year":
      return new Date(d.getFullYear() + dir, d.getMonth(), Math.min(d.getDate(), 28));
  }
}

/** Tasks that have a due date, grouped by local day. Date-only tasks come
    first, then timed tasks in time order. */
export function tasksByDay(tasks: Task[]): Map<string, Task[]> {
  const map = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!t.due_at) continue;
    const key = dateKey(new Date(t.due_at));
    const list = map.get(key) ?? [];
    list.push(t);
    map.set(key, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => {
      if (a.due_has_time !== b.due_has_time) return a.due_has_time ? 1 : -1;
      if (a.due_has_time && b.due_has_time) {
        return new Date(a.due_at as string).getTime() - new Date(b.due_at as string).getTime();
      }
      return a.name.localeCompare(b.name);
    });
  }
  return map;
}

/** Calendar events grouped by local day. All-day events appear on every day
    they span. */
export function eventsByDay(events: CalEvent[]): Map<string, CalEvent[]> {
  const map = new Map<string, CalEvent[]>();
  const push = (key: string, e: CalEvent) => {
    const list = map.get(key) ?? [];
    list.push(e);
    map.set(key, list);
  };
  for (const e of events) {
    if (e.allDay) {
      const start = parseKey(e.start.slice(0, 10));
      const end = e.end ? parseKey(e.end.slice(0, 10)) : addDays(start, 1);
      let day = start;
      let guard = 0;
      while (day < end && guard < 62) {
        push(dateKey(day), e);
        day = addDays(day, 1);
        guard += 1;
      }
    } else {
      push(dateKey(new Date(e.start)), e);
    }
  }
  for (const list of map.values()) {
    list.sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return a.start.localeCompare(b.start);
    });
  }
  return map;
}

export const HOUR_RANGE_DEFAULT = { start: 7, end: 21 };
export const MIN_HOURS = 6;
