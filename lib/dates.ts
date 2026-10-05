/* Due dates are stored as a moment at local noon, so the calendar day stays
   the same in any time zone within a few hours of the person who set it. */

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromDateInputValue(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return d.toISOString();
}

export function toTimeInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Combine a YYYY-MM-DD date with an optional HH:MM time. Without a time the
    moment is local noon, as for any date-only due date. */
export function combineDateTime(date: string, time: string | null): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const t = time ? /^(\d{2}):(\d{2})$/.exec(time) : null;
  const d = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    t ? Number(t[1]) : 12,
    t ? Number(t[2]) : 0
  );
  return d.toISOString();
}

function timeText(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export type DueTone = "overdue" | "soon" | "normal";

export function dueLabel(
  iso: string,
  done: boolean,
  hasTime = false
): { text: string; tone: DueTone } {
  const due = startOfDay(new Date(iso));
  const today = startOfDay(new Date());
  const days = Math.round((due.getTime() - today.getTime()) / 86400000);

  let text: string;
  if (days === 0) text = "Today";
  else if (days === 1) text = "Tomorrow";
  else if (days === -1) text = "Yesterday";
  else {
    const sameYear = due.getFullYear() === today.getFullYear();
    text = due.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(sameYear ? {} : { year: "numeric" }),
    });
  }

  if (hasTime) text = `${text}, ${timeText(iso)}`;

  if (done) return { text, tone: "normal" };
  if (days < 0) return { text, tone: "overdue" };
  if (days <= 1) return { text, tone: "soon" };
  return { text, tone: "normal" };
}
