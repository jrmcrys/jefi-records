"use client";

import { useEffect, useMemo, useState } from "react";
import {
  HOUR_RANGE_DEFAULT,
  MIN_HOURS,
  addDays,
  dateKey,
  eventsByDay,
  hourLabel,
  monthGrid,
  parseKey,
  sameDay,
  startOfDay,
  stepDate,
  tasksByDay,
  timeLabel,
  titleFor,
  weekDays,
  type CalEvent,
  type CalendarMode,
} from "@/lib/calendar";
import { combineDateTime, toTimeInputValue } from "@/lib/dates";
import type { Status, Task } from "@/lib/types";

const PREFS_KEY = "jefi:calendar";
const MODES: CalendarMode[] = ["day", "week", "month", "year"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Prefs = { mode: CalendarMode; start: number; end: number };

function readPrefs(): Prefs {
  const fallback: Prefs = { mode: "month", ...HOUR_RANGE_DEFAULT };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as Partial<Prefs>;
    const mode = MODES.includes(p.mode as CalendarMode) ? (p.mode as CalendarMode) : "month";
    let start = Number.isInteger(p.start) ? Math.min(18, Math.max(0, p.start as number)) : fallback.start;
    let end = Number.isInteger(p.end) ? Math.min(24, Math.max(MIN_HOURS, p.end as number)) : fallback.end;
    if (end - start < MIN_HOURS) {
      end = Math.min(24, start + MIN_HOURS);
      start = end - MIN_HOURS;
    }
    return { mode, start, end };
  } catch {
    return fallback;
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

type DragPayload = { id: string };

function TaskChip({
  task,
  status,
  showTime,
  onOpen,
}: {
  task: Task;
  status?: Status;
  showTime: boolean;
  onOpen: (id: string) => void;
}) {
  const done = Boolean(task.completed_at);
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        const payload: DragPayload = { id: task.id };
        e.dataTransfer.setData("application/x-jefi-task", JSON.stringify(payload));
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => onOpen(task.id)}
      title={task.name}
      className={`flex w-full min-w-0 items-center gap-1.5 rounded border border-current/15 bg-background px-1.5 py-0.5 text-left text-xs hover:border-current/40 ${
        done ? "opacity-50" : ""
      }`}
    >
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: status?.color ?? "#71717a" }}
      />
      {showTime && task.due_has_time && task.due_at && (
        <span className="shrink-0 tabular-nums opacity-70">{timeLabel(task.due_at)}</span>
      )}
      <span className={`min-w-0 truncate ${done ? "line-through" : ""}`}>{task.name}</span>
    </button>
  );
}

function EventChip({ event, showTime }: { event: CalEvent; showTime: boolean }) {
  return (
    <div
      title={event.title}
      className="flex w-full min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-xs"
      style={{
        borderLeft: `3px solid ${event.color}`,
        backgroundColor: `color-mix(in srgb, ${event.color} 14%, transparent)`,
      }}
    >
      {showTime && !event.allDay && (
        <span className="shrink-0 tabular-nums opacity-70">{timeLabel(event.start)}</span>
      )}
      <span className="min-w-0 truncate">{event.title}</span>
    </div>
  );
}

export default function CalendarView({
  tasks,
  statuses,
  events = [],
  onRange,
  onOpenTask,
  onReschedule,
}: {
  tasks: Task[];
  statuses: Status[];
  events?: CalEvent[];
  /** Called with the visible span (from inclusive, to exclusive) as ISO moments. */
  onRange?: (range: { from: string; to: string }) => void;
  onOpenTask: (id: string) => void;
  onReschedule: (task: Task, patch: { due_at: string | null; due_has_time: boolean }) => void;
}) {
  const [prefs, setPrefs] = useState<Prefs>(() => readPrefs());
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const { mode, start, end } = prefs;

  const visible = useMemo(() => {
    let from: Date;
    let to: Date;
    if (mode === "day") {
      from = startOfDay(cursor);
      to = addDays(from, 1);
    } else if (mode === "week") {
      from = weekDays(cursor)[0];
      to = addDays(from, 7);
    } else if (mode === "year") {
      from = new Date(cursor.getFullYear(), 0, 1);
      to = new Date(cursor.getFullYear() + 1, 0, 1);
    } else {
      const grid = monthGrid(cursor.getFullYear(), cursor.getMonth());
      from = grid[0][0];
      to = addDays(grid[5][6], 1);
    }
    return { from: from.toISOString(), to: to.toISOString() };
  }, [mode, cursor]);

  useEffect(() => {
    onRange?.(visible);
  }, [visible, onRange]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* the calendar simply will not remember its settings */
    }
  }, [prefs]);

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses]);
  const byDay = useMemo(() => tasksByDay(tasks), [tasks]);
  const eventsDay = useMemo(() => eventsByDay(events), [events]);
  const today = new Date();
  const undated = tasks.filter((t) => !t.due_at && !t.completed_at).length;

  function move(task: Task, key: string, hour?: number) {
    if (hour !== undefined) {
      const minutes =
        task.due_has_time && task.due_at ? toTimeInputValue(task.due_at).slice(3) : "00";
      onReschedule(task, {
        due_at: combineDateTime(key, `${pad(hour)}:${minutes}`),
        due_has_time: true,
      });
      return;
    }
    const time = task.due_has_time && task.due_at ? toTimeInputValue(task.due_at) : null;
    onReschedule(task, { due_at: combineDateTime(key, time), due_has_time: Boolean(time) });
  }

  function dropProps(key: string, hour?: number) {
    return {
      onDragOver: (e: React.DragEvent) => {
        if (e.dataTransfer.types.includes("application/x-jefi-task")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }
      },
      onDrop: (e: React.DragEvent) => {
        const raw = e.dataTransfer.getData("application/x-jefi-task");
        if (!raw) return;
        e.preventDefault();
        try {
          const { id } = JSON.parse(raw) as DragPayload;
          const task = tasks.find((t) => t.id === id);
          if (task) move(task, key, hour);
        } catch {
          /* ignore a drop that is not one of our tasks */
        }
      },
    };
  }

  function goDay(d: Date) {
    setCursor(d);
    setPrefs((p) => ({ ...p, mode: "day" }));
  }

  function setMode(m: CalendarMode) {
    setPrefs((p) => ({ ...p, mode: m }));
  }

  function setRange(nextStart: number, nextEnd: number) {
    let s = Math.min(18, Math.max(0, nextStart));
    let e = Math.min(24, Math.max(s + MIN_HOURS, nextEnd));
    if (e > 24) {
      e = 24;
      s = 24 - MIN_HOURS;
    }
    setPrefs((p) => ({ ...p, start: s, end: e }));
  }

  /* shared pieces */

  function itemsFor(key: string, opts: { timed: boolean | null; hour?: number; limit?: number }) {
    const ts = (byDay.get(key) ?? []).filter((t) => {
      if (opts.timed === null) return true;
      if (!t.due_has_time) return !opts.timed;
      if (!opts.timed) return false;
      if (opts.hour === undefined) return true;
      const h = new Date(t.due_at as string).getHours();
      const first = opts.hour === start;
      const last = opts.hour === end - 1;
      return h === opts.hour || (first && h < start) || (last && h >= end);
    });
    const es = (eventsDay.get(key) ?? []).filter((e) => {
      if (opts.timed === null) return true;
      if (e.allDay) return !opts.timed;
      if (!opts.timed) return false;
      if (opts.hour === undefined) return true;
      const h = new Date(e.start).getHours();
      const first = opts.hour === start;
      const last = opts.hour === end - 1;
      return h === opts.hour || (first && h < start) || (last && h >= end);
    });
    return { ts, es };
  }

  function renderItems(key: string, opts: { timed: boolean | null; hour?: number }) {
    const { ts, es } = itemsFor(key, opts);
    return (
      <>
        {es.map((e) => (
          <EventChip key={`${e.id}:${key}`} event={e} showTime />
        ))}
        {ts.map((t) => (
          <TaskChip
            key={t.id}
            task={t}
            status={t.status_id ? statusById.get(t.status_id) : undefined}
            showTime
            onOpen={onOpenTask}
          />
        ))}
      </>
    );
  }

  /* views */

  function renderMonth() {
    const grid = monthGrid(cursor.getFullYear(), cursor.getMonth());
    return (
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-7 border-y border-current/15 text-xs font-medium opacity-70">
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-2 py-1.5">
                {d}
              </div>
            ))}
          </div>
          {grid.map((week, i) => (
            <div key={i} className="grid grid-cols-7">
              {week.map((day) => {
                const key = dateKey(day);
                const outside = day.getMonth() !== cursor.getMonth();
                const isToday = sameDay(day, today);
                const ts = byDay.get(key) ?? [];
                const es = eventsDay.get(key) ?? [];
                const total = ts.length + es.length;
                const shownEvents = es.slice(0, 2);
                const shownTasks = ts.slice(0, Math.max(0, 3 - shownEvents.length));
                const hidden = total - shownEvents.length - shownTasks.length;
                return (
                  <div
                    key={key}
                    {...dropProps(key)}
                    aria-label={`${day.toLocaleDateString("en-US", { month: "long", day: "numeric" })}, ${total} item${total === 1 ? "" : "s"}`}
                    className={`min-h-24 border-b border-l border-current/10 p-1 ${
                      outside ? "bg-current/[0.03]" : ""
                    } ${i === 0 ? "" : ""}`}
                  >
                    <button
                      type="button"
                      onClick={() => goDay(day)}
                      aria-label={`Open ${day.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`}
                      className={`mb-1 flex size-6 items-center justify-center rounded-full text-xs hover:bg-current/10 ${
                        isToday ? "bg-accent font-semibold text-white hover:bg-accent" : ""
                      } ${outside ? "opacity-40" : ""}`}
                    >
                      {day.getDate()}
                    </button>
                    <div className="space-y-0.5">
                      {shownEvents.map((e) => (
                        <EventChip key={`${e.id}:${key}`} event={e} showTime={false} />
                      ))}
                      {shownTasks.map((t) => (
                        <TaskChip
                          key={t.id}
                          task={t}
                          status={t.status_id ? statusById.get(t.status_id) : undefined}
                          showTime={false}
                          onOpen={onOpenTask}
                        />
                      ))}
                      {hidden > 0 && (
                        <button
                          type="button"
                          onClick={() => goDay(day)}
                          className="px-1.5 text-xs underline opacity-70 hover:opacity-100"
                        >
                          {hidden} more
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderHours(days: Date[]) {
    const hours = Array.from({ length: end - start }, (_, i) => start + i);
    const cols = `56px repeat(${days.length}, minmax(0, 1fr))`;
    const minW = days.length > 1 ? "min-w-[720px]" : "";
    return (
      <div className="overflow-x-auto">
        <div className={minW}>
          <div
            className="grid border-y border-current/15 text-xs"
            style={{ gridTemplateColumns: cols }}
          >
            <div />
            {days.map((day) => {
              const isToday = sameDay(day, today);
              return (
                <button
                  key={dateKey(day)}
                  type="button"
                  onClick={() => days.length > 1 && goDay(day)}
                  disabled={days.length === 1}
                  className={`border-l border-current/10 px-2 py-1.5 text-left ${
                    days.length > 1 ? "hover:bg-current/5" : "cursor-default"
                  }`}
                >
                  <span className="opacity-70">
                    {day.toLocaleDateString("en-US", { weekday: "short" })}
                  </span>{" "}
                  <span
                    className={`inline-flex size-6 items-center justify-center rounded-full ${
                      isToday ? "bg-accent font-semibold text-white" : ""
                    }`}
                  >
                    {day.getDate()}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid border-b border-current/15" style={{ gridTemplateColumns: cols }}>
            <div className="px-1 py-1.5 text-right text-[11px] opacity-60">All day</div>
            {days.map((day) => {
              const key = dateKey(day);
              return (
                <div
                  key={key}
                  {...dropProps(key)}
                  className="min-h-9 space-y-0.5 border-l border-current/10 p-1"
                >
                  {renderItems(key, { timed: false })}
                </div>
              );
            })}
          </div>

          {hours.map((h) => (
            <div
              key={h}
              className="grid border-b border-current/10"
              style={{ gridTemplateColumns: cols }}
            >
              <div className="px-1 py-1 text-right text-[11px] tabular-nums opacity-60">
                {hourLabel(h)}
              </div>
              {days.map((day) => {
                const key = dateKey(day);
                return (
                  <div
                    key={key}
                    {...dropProps(key, h)}
                    className="min-h-11 space-y-0.5 border-l border-current/10 p-1"
                  >
                    {renderItems(key, { timed: true, hour: h })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderYear() {
    const year = cursor.getFullYear();
    return (
      <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 12 }, (_, m) => {
          const grid = monthGrid(year, m);
          const name = new Date(year, m, 1).toLocaleDateString("en-US", { month: "long" });
          return (
            <section key={m} aria-label={`${name} ${year}`}>
              <button
                type="button"
                onClick={() => {
                  setCursor(new Date(year, m, 1));
                  setMode("month");
                }}
                className="mb-1 text-sm font-semibold hover:underline"
              >
                {name}
              </button>
              <div className="grid grid-cols-7 text-center text-[10px] opacity-50">
                {WEEKDAYS.map((d) => (
                  <span key={d}>{d[0]}</span>
                ))}
              </div>
              {grid.map((week, i) => (
                <div key={i} className="grid grid-cols-7 text-center text-xs">
                  {week.map((day) => {
                    const key = dateKey(day);
                    if (day.getMonth() !== m) return <span key={key} />;
                    const n = (byDay.get(key)?.length ?? 0) + (eventsDay.get(key)?.length ?? 0);
                    const isToday = sameDay(day, today);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => goDay(day)}
                        aria-label={`${day.toLocaleDateString("en-US", { month: "long", day: "numeric" })}, ${n} item${n === 1 ? "" : "s"}`}
                        className={`m-0.5 flex aspect-square items-center justify-center rounded-full hover:ring-1 hover:ring-current/40 ${
                          isToday ? "bg-accent font-semibold text-white" : ""
                        } ${!isToday && n > 0 ? "bg-accent/20 font-medium" : ""}`}
                      >
                        {day.getDate()}
                      </button>
                    );
                  })}
                </div>
              ))}
            </section>
          );
        })}
      </div>
    );
  }

  const selectClass =
    "rounded-md border border-current/20 bg-background px-2 py-1 text-sm text-foreground";

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={`Previous ${mode}`}
            onClick={() => setCursor((c) => stepDate(mode, c, -1))}
            className="flex size-8 items-center justify-center rounded-md border border-current/20 hover:border-current/50"
          >
            {"‹"}
          </button>
          <button
            type="button"
            aria-label={`Next ${mode}`}
            onClick={() => setCursor((c) => stepDate(mode, c, 1))}
            className="flex size-8 items-center justify-center rounded-md border border-current/20 hover:border-current/50"
          >
            {"›"}
          </button>
          <button
            type="button"
            onClick={() => setCursor(new Date())}
            className="rounded-md border border-current/20 px-3 py-1.5 text-sm hover:border-current/50"
          >
            Today
          </button>
        </div>
        <h2 className="min-w-0 flex-1 text-lg font-semibold" aria-live="polite">
          {titleFor(mode, cursor)}
        </h2>
        <div role="radiogroup" aria-label="Calendar range" className="flex overflow-hidden rounded-md border border-current/20 text-sm">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 capitalize ${
                mode === m ? "bg-accent/15 font-medium" : "hover:bg-current/10"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {(mode === "day" || mode === "week") && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="opacity-70">Show hours</span>
          <select
            aria-label="First hour shown"
            value={start}
            onChange={(e) => setRange(Number(e.target.value), end)}
            className={selectClass}
          >
            {Array.from({ length: 19 }, (_, h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
          <span className="opacity-70">to</span>
          <select
            aria-label="Last hour shown"
            value={end}
            onChange={(e) => setRange(start, Number(e.target.value))}
            className={selectClass}
          >
            {Array.from({ length: 24 - start - MIN_HOURS + 1 }, (_, i) => start + MIN_HOURS + i).map(
              (h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              )
            )}
          </select>
          <span className="text-xs opacity-60">
            Tasks outside this range stay in the first or last row.
          </span>
        </div>
      )}

      <div className="mt-3">
        {mode === "month" && renderMonth()}
        {mode === "week" && renderHours(weekDays(cursor))}
        {mode === "day" && renderHours([parseKey(dateKey(cursor))])}
        {mode === "year" && renderYear()}
      </div>

      {undated > 0 && (
        <p className="mt-3 text-xs opacity-60">
          {undated} incomplete task{undated === 1 ? " has" : "s have"} no due date and
          {undated === 1 ? " does" : " do"} not appear on the calendar. Set a due date in the
          list and it shows up here. Drag a task to another day to reschedule it.
        </p>
      )}
    </div>
  );
}
