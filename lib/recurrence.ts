export type Freq = "daily" | "weekly" | "monthly" | "yearly";

export type Recurrence = {
  freq: Freq;
  interval: number;
  /** 0 is Sunday through 6 is Saturday. Only used when freq is weekly. */
  days?: number[];
  /** Last date (YYYY-MM-DD) a new copy may be due on. */
  until?: string | null;
  /** IANA time zone the repeat is calculated in. */
  tz?: string;
};

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const DAY_SHORT = ["S", "M", "T", "W", "T", "F", "S"];

export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function parseRecurrence(value: unknown): Recurrence | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const freq = v.freq;
  if (freq !== "daily" && freq !== "weekly" && freq !== "monthly" && freq !== "yearly") {
    return null;
  }
  const interval =
    typeof v.interval === "number" && v.interval >= 1 ? Math.floor(v.interval) : 1;
  const days = Array.isArray(v.days)
    ? v.days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6)
    : undefined;
  return {
    freq,
    interval,
    days: days && days.length ? [...new Set(days)].sort() : undefined,
    until: typeof v.until === "string" && v.until ? v.until : null,
    tz: typeof v.tz === "string" ? v.tz : undefined,
  };
}

const UNIT: Record<Freq, [string, string]> = {
  daily: ["day", "days"],
  weekly: ["week", "weeks"],
  monthly: ["month", "months"],
  yearly: ["year", "years"],
};

export function describeRecurrence(r: Recurrence | null): string {
  if (!r) return "Does not repeat";
  const days = r.days ?? [];
  let text: string;
  if (r.freq === "weekly" && days.length) {
    const names = days.map((d) => DAY_NAMES[d].slice(0, 3)).join(", ");
    const isWeekdays = days.join() === "1,2,3,4,5";
    const base = isWeekdays ? "Every weekday" : `Every ${r.interval === 1 ? "week" : `${r.interval} weeks`} on ${names}`;
    text = base;
  } else if (r.interval === 1) {
    text = { daily: "Every day", weekly: "Every week", monthly: "Every month", yearly: "Every year" }[r.freq];
  } else {
    text = `Every ${r.interval} ${UNIT[r.freq][1]}`;
  }
  if (r.until) text += ` until ${r.until}`;
  return text;
}
