"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  combineDateTime,
  dueLabel,
  toDateInputValue,
  toTimeInputValue,
} from "@/lib/dates";
import {
  DAY_NAMES,
  DAY_SHORT,
  describeRecurrence,
  localTimeZone,
  type Freq,
  type Recurrence,
} from "@/lib/recurrence";

export type DuePatch = {
  due_at: string | null;
  due_has_time: boolean;
  recurrence: Recurrence | null;
};

type Preset = "none" | "daily" | "weekdays" | "weekly" | "monthly" | "yearly" | "custom";

function presetOf(r: Recurrence | null): Preset {
  if (!r) return "none";
  const days = r.days ?? [];
  if (r.interval === 1) {
    if (r.freq === "daily") return "daily";
    if (r.freq === "monthly") return "monthly";
    if (r.freq === "yearly") return "yearly";
    if (r.freq === "weekly") {
      if (days.length === 0) return "weekly";
      if (days.join() === "1,2,3,4,5") return "weekdays";
    }
  }
  return "custom";
}

const field =
  "rounded-md border border-current/20 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-current/50";

export default function DueDate({
  value,
  hasTime,
  recurrence,
  done,
  onChange,
}: {
  value: string | null;
  hasTime: boolean;
  recurrence: Recurrence | null;
  done: boolean;
  onChange: (patch: DuePatch) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const label = value ? dueLabel(value, done, hasTime) : null;
  const preset = presetOf(recurrence);
  const dateValue = toDateInputValue(value);
  const timeValue = hasTime ? toTimeInputValue(value) : "";

  const place = useCallback(() => {
    const btn = buttonRef.current;
    const pop = popRef.current;
    if (!btn || !pop) return;
    const rect = btn.getBoundingClientRect();
    const width = pop.offsetWidth;
    const height = pop.offsetHeight;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    let top = rect.bottom + 4;
    if (top + height > window.innerHeight - 8) {
      top = Math.max(8, rect.top - height - 4);
    }
    setPos({ left, top });
  }, []);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(place);
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place, recurrence, hasTime]);

  function emit(next: Partial<DuePatch> & { date?: string; time?: string | null }) {
    const date = next.date ?? dateValue;
    const wantsTime = next.time !== undefined ? next.time !== null : hasTime;
    const time =
      next.time !== undefined ? next.time : hasTime ? toTimeInputValue(value) : null;
    const due =
      next.due_at !== undefined
        ? next.due_at
        : date
          ? combineDateTime(date, wantsTime ? (time || "09:00") : null)
          : null;
    onChange({
      due_at: due,
      due_has_time: due ? wantsTime : false,
      recurrence: due
        ? next.recurrence !== undefined
          ? next.recurrence
          : recurrence
        : null,
    });
  }

  function setPreset(p: Preset) {
    const today = toDateInputValue(new Date().toISOString());
    const date = dateValue || today;
    const tz = recurrence?.tz ?? localTimeZone();
    const until = recurrence?.until ?? null;
    let next: Recurrence | null = null;
    const base = { interval: 1, tz, until };
    if (p === "daily") next = { freq: "daily", ...base };
    else if (p === "weekdays") next = { freq: "weekly", days: [1, 2, 3, 4, 5], ...base };
    else if (p === "weekly") next = { freq: "weekly", ...base };
    else if (p === "monthly") next = { freq: "monthly", ...base };
    else if (p === "yearly") next = { freq: "yearly", ...base };
    else if (p === "custom") {
      next = recurrence ?? { freq: "weekly", ...base };
      if (presetOf(recurrence) !== "custom") next = { ...next, interval: 2 };
    }
    emit({ date, recurrence: next });
  }

  function patchRecurrence(patch: Partial<Recurrence>) {
    if (!recurrence) return;
    emit({ recurrence: { ...recurrence, ...patch } });
  }

  function toggleDay(d: number) {
    if (!recurrence) return;
    const current = recurrence.days ?? [];
    const days = current.includes(d)
      ? current.filter((x) => x !== d)
      : [...current, d].sort();
    patchRecurrence({ days: days.length ? days : undefined });
  }

  const tone =
    label?.tone === "overdue"
      ? "text-red-500"
      : label?.tone === "soon"
        ? "text-green-600"
        : "";

  return (
    <div className="relative flex w-full items-center">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={
          value
            ? `Due ${label?.text}${recurrence ? `, ${describeRecurrence(recurrence)}` : ""}. Change`
            : "Set due date"
        }
        className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-current/10 ${tone} ${
          value ? "" : "opacity-40 hover:opacity-100"
        }`}
      >
        <span className="truncate">{label ? label.text : "Set date"}</span>
        {recurrence && (
          <svg
            viewBox="0 0 16 16"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            role="img"
            aria-label="Repeats"
            className="shrink-0 opacity-70"
          >
            <path d="M3 7a5 5 0 018.5-2.5L13 6" />
            <path d="M13 3v3h-3" />
            <path d="M13 9a5 5 0 01-8.5 2.5L3 10" />
            <path d="M3 13v-3h3" />
          </svg>
        )}
      </button>

      {open && (
        <div
          ref={popRef}
          role="dialog"
          aria-label="Due date and repeat"
          style={{
            position: "fixed",
            left: pos?.left ?? 0,
            top: pos?.top ?? 0,
            visibility: pos ? "visible" : "hidden",
          }}
          className="z-[70] w-72 max-w-[calc(100vw-1rem)] space-y-3 rounded-lg border border-current/20 bg-background p-3 text-sm shadow-xl"
        >
          <label className="block">
            <span className="mb-1 block text-xs opacity-60">Due date</span>
            <input
              type="date"
              value={dateValue}
              onChange={(e) =>
                e.target.value
                  ? emit({ date: e.target.value })
                  : emit({ due_at: null })
              }
              className={`${field} w-full`}
            />
          </label>

          {dateValue && (
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={hasTime}
                  onChange={(e) =>
                    emit({ time: e.target.checked ? "09:00" : null })
                  }
                  className="size-4 accent-accent"
                />
                Add a time
              </label>
              {hasTime && (
                <input
                  type="time"
                  value={timeValue}
                  aria-label="Due time"
                  onChange={(e) => emit({ time: e.target.value || "09:00" })}
                  className={`${field} ml-auto`}
                />
              )}
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-xs opacity-60">Repeat</span>
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value as Preset)}
              className={`${field} w-full bg-background text-foreground`}
            >
              <option value="none">Does not repeat</option>
              <option value="daily">Every day</option>
              <option value="weekdays">Every weekday</option>
              <option value="weekly">Every week</option>
              <option value="monthly">Every month</option>
              <option value="yearly">Every year</option>
              <option value="custom">Custom</option>
            </select>
          </label>

          {recurrence && preset === "custom" && (
            <div className="space-y-2 rounded-md border border-current/15 p-2">
              <div className="flex items-center gap-2">
                <span>Every</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={recurrence.interval}
                  aria-label="Repeat every"
                  onChange={(e) =>
                    patchRecurrence({
                      interval: Math.max(1, Math.min(365, Number(e.target.value) || 1)),
                    })
                  }
                  className={`${field} w-16`}
                />
                <select
                  value={recurrence.freq}
                  aria-label="Repeat unit"
                  onChange={(e) =>
                    patchRecurrence({
                      freq: e.target.value as Freq,
                      days: e.target.value === "weekly" ? recurrence.days : undefined,
                    })
                  }
                  className={`${field} flex-1 bg-background text-foreground`}
                >
                  <option value="daily">{recurrence.interval === 1 ? "day" : "days"}</option>
                  <option value="weekly">{recurrence.interval === 1 ? "week" : "weeks"}</option>
                  <option value="monthly">{recurrence.interval === 1 ? "month" : "months"}</option>
                  <option value="yearly">{recurrence.interval === 1 ? "year" : "years"}</option>
                </select>
              </div>
              {recurrence.freq === "weekly" && (
                <div role="group" aria-label="Repeat on" className="flex gap-1">
                  {DAY_SHORT.map((label, d) => {
                    const on = recurrence.days?.includes(d) ?? false;
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-label={DAY_NAMES[d]}
                        aria-pressed={on}
                        onClick={() => toggleDay(d)}
                        className={`size-8 rounded-full border text-xs ${
                          on
                            ? "border-accent bg-accent text-white"
                            : "border-current/20 hover:border-current/50"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {recurrence && (
            <label className="block">
              <span className="mb-1 block text-xs opacity-60">
                Stop repeating after (optional)
              </span>
              <input
                type="date"
                value={recurrence.until ?? ""}
                min={dateValue || undefined}
                onChange={(e) => patchRecurrence({ until: e.target.value || null })}
                className={`${field} w-full`}
              />
            </label>
          )}

          {recurrence && (
            <p className="text-xs opacity-60">
              {describeRecurrence(recurrence)}. When you complete this task, the
              next one is created automatically.
            </p>
          )}

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              disabled={!value}
              onClick={() => {
                emit({ due_at: null });
                setOpen(false);
              }}
              className="text-sm text-red-500 underline disabled:opacity-30"
            >
              Remove date
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
