"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { dueLabel, fromDateInputValue } from "@/lib/dates";
import { dateKey, type CalEvent } from "@/lib/calendar";
import { timeAgo } from "@/lib/format";
import { useGoogleEvents } from "@/lib/useGoogleEvents";
import { TASK_COLUMNS, type Profile, type Status, type Task } from "@/lib/types";
import {
  QUICK_PROMPTS,
  buildClaudePrompt,
  claudeUrl,
  type PromptKind,
} from "@/lib/claudePrompt";
import { HOME_LABELS, HOME_SECTIONS, type HomeSection } from "@/lib/personal";
import Popover from "./Popover";
import PageIntro from "./PageIntro";
import ProjectImage from "./ProjectImage";
import { usePersonal } from "./PersonalProvider";
import { sentence, SELECT as NOTIFICATION_SELECT, type Row as NotificationRow } from "./Inbox";
import PageCover from "./PageCover";

export type HomeProject = {
  id: string;
  name: string;
  image_url?: string | null;
  emoji?: string | null;
};

const card = "rounded-lg border border-current/15 p-4";
const cardTitle = "text-sm font-semibold";

/* ------------------------------------------------------------------ */
/* Ask Claude                                                          */
/* ------------------------------------------------------------------ */

function ClaudeBox({ projects, otherName }: { projects: HomeProject[]; otherName: string }) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<null | "status" | "plan">(null);
  const [projectName, setProjectName] = useState(projects[0]?.name ?? "");
  const [note, setNote] = useState<string | null>(null);

  async function send(kind: PromptKind, value?: string) {
    setNote(null);
    const prompt = buildClaudePrompt({ kind, text: value, otherName });
    const url = claudeUrl(prompt);
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    try {
      await navigator.clipboard.writeText(prompt);
      window.open("https://claude.ai/new", "_blank", "noopener,noreferrer");
      setNote("That question is too long for a link, so it is copied. Paste it into the new Claude chat.");
    } catch {
      setNote("That question is too long to send as a link. Shorten it and try again.");
    }
  }

  function chip(kind: PromptKind) {
    if (kind === "status") {
      setMode(mode === "status" ? null : "status");
    } else if (kind === "plan") {
      setMode(mode === "plan" ? null : "plan");
    } else {
      setMode(null);
      void send(kind);
    }
  }

  const submit = () => {
    if (mode === "plan") {
      if (text.trim()) void send("plan", text);
    } else if (text.trim()) {
      void send("custom", text);
    }
  };

  return (
    <section className={card} aria-labelledby="ask-claude">
      <h2 id="ask-claude" className={cardTitle}>
        Ask Claude
      </h2>
      <p className="mt-1 text-xs opacity-60">
        Opens a new Claude chat with your question filled in. Claude looks
        through Jefi Records with your connector, sees only what you can see,
        and asks before it changes anything.
      </p>

      <div className="mt-3">
        <label htmlFor="ask-claude-text" className="sr-only">
          Your question for Claude
        </label>
        <textarea
          id="ask-claude-text"
          value={text}
          rows={mode === "plan" ? 4 : 2}
          maxLength={2000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={
            mode === "plan"
              ? "Describe the project or goal, such as: launch a 4 week email course"
              : "Ask anything about your projects, tasks, comments or what to do next"
          }
          className="w-full resize-y rounded-md border border-current/20 bg-transparent px-3 py-2 text-sm outline-none placeholder:opacity-50 focus:border-current/50"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!text.trim()}
            onClick={submit}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {mode === "plan" ? "Plan with Claude" : "Ask Claude"}
          </button>
          <span className="text-xs opacity-50">Cmd or Ctrl and Enter also sends</span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Quick prompts">
        {QUICK_PROMPTS.map((q) => (
          <button
            key={q.kind}
            type="button"
            aria-pressed={(q.kind === "status" || q.kind === "plan") && mode === q.kind}
            onClick={() => chip(q.kind)}
            className={`rounded-full border px-3 py-1.5 text-sm hover:bg-current/10 ${
              mode === q.kind ? "border-accent bg-accent/10" : "border-current/20"
            }`}
          >
            {q.label}
          </button>
        ))}
      </div>

      {mode === "status" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label htmlFor="status-project" className="text-sm">
            Project
          </label>
          <select
            id="status-project"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="min-w-0 rounded-md border border-current/20 bg-transparent px-2 py-1.5 text-sm"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.name} className="text-black">
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!projectName}
            onClick={() => void send("status", projectName)}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            Summarize in Claude
          </button>
        </div>
      )}

      {mode === "plan" && (
        <p className="mt-3 text-xs opacity-60">
          Type the goal above, then press Plan with Claude. Claude drafts sections and tasks and waits for your yes
          before adding anything.
        </p>
      )}

      {note && (
        <p role="status" className="mt-3 text-sm">
          {note}
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Due today and overdue                                               */
/* ------------------------------------------------------------------ */

type TaskRow = Task & { project: { id: string; name: string; archived: boolean } };

function TasksCard({ meId }: { meId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const t = await supabase
      .from("tasks")
      .select(`${TASK_COLUMNS},project:projects!inner(id,name,archived)`)
      .eq("assignee_id", meId)
      .is("completed_at", null)
      .not("due_at", "is", null)
      .lte("due_at", end.toISOString())
      .order("due_at");
    if (t.error) {
      setError(t.error.message);
      setLoading(false);
      return;
    }
    const list = ((t.data ?? []) as unknown as TaskRow[]).filter((r) => !r.project.archived);
    const ids = [...new Set(list.map((r) => r.project_id))];
    const st = ids.length
      ? await supabase
          .from("project_statuses")
          .select("id,project_id,name,color,position,is_done")
          .in("project_id", ids)
      : { data: [], error: null };
    setRows(list);
    setStatuses((st.data ?? []) as Status[]);
    setLoading(false);
  }, [supabase, meId]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    const channel = supabase
      .channel("home-tasks")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => load())
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [supabase, load]);

  async function complete(row: TaskRow) {
    const done = statuses.find((s) => s.project_id === row.project_id && s.is_done);
    const patch = {
      status_id: done?.id ?? row.status_id,
      completed_at: new Date().toISOString(),
    };
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    const { error } = await supabase.from("tasks").update(patch).eq("id", row.id);
    if (error) {
      setError(error.message);
      load();
    }
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const overdue = rows.filter((r) => r.due_at && new Date(r.due_at) < startOfToday);
  const dueToday = rows.filter((r) => r.due_at && new Date(r.due_at) >= startOfToday);

  function list(title: string, items: TaskRow[]) {
    if (items.length === 0) return null;
    return (
      <div className="mt-3">
        <h3 className="text-xs font-medium uppercase tracking-wide opacity-50">{title}</h3>
        <ul className="mt-1">
          {items.map((r) => {
            const due = r.due_at ? dueLabel(r.due_at, false, r.due_has_time) : null;
            return (
              <li key={r.id} className="flex items-center gap-2 rounded-md px-1 py-1.5 hover:bg-current/5">
                <input
                  type="checkbox"
                  aria-label={`Complete ${r.name}`}
                  onChange={() => void complete(r)}
                  className="size-4 shrink-0 cursor-pointer accent-accent"
                />
                <Link href={`/p/${r.project_id}?task=${r.id}`} className="min-w-0 flex-1 text-sm">
                  <span className="block truncate">{r.name}</span>
                  <span className="block truncate text-xs opacity-60">{r.project.name}</span>
                </Link>
                {due && (
                  <span className={`shrink-0 text-xs ${due.tone === "overdue" ? "text-red-500" : "opacity-60"}`}>
                    {due.text}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <section className={card} aria-labelledby="home-tasks">
      <div className="flex items-center justify-between gap-2">
        <h2 id="home-tasks" className={cardTitle}>
          Due today and overdue
        </h2>
        <Link href="/my-tasks" className="text-xs underline opacity-70 hover:opacity-100">
          All my tasks
        </Link>
      </div>
      {loading ? (
        <p className="mt-3 text-sm opacity-60">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm opacity-70">Nothing due today or overdue. Nice and clear.</p>
      ) : (
        <>
          {list("Overdue", overdue)}
          {list("Due today", dueToday)}
        </>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-500">
          {error}
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Today's calendar                                                    */
/* ------------------------------------------------------------------ */

function eventTime(e: CalEvent): string {
  if (e.allDay) return "All day";
  return new Date(e.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function CalendarCard() {
  const [range] = useState(() => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    return { from: from.toISOString(), to: to.toISOString() };
  });
  const events = useGoogleEvents(range);
  const todayKey = dateKey(new Date(range.from));
  const today = events
    .filter((e) => {
      if (e.allDay) return e.start <= todayKey && (!e.end || e.end > todayKey);
      return true;
    })
    .sort((a, b) => (a.allDay === b.allDay ? a.start.localeCompare(b.start) : a.allDay ? -1 : 1));

  return (
    <section className={card} aria-labelledby="home-calendar">
      <h2 id="home-calendar" className={cardTitle}>
        Today&apos;s calendar
      </h2>
      {today.length === 0 ? (
        <p className="mt-3 text-sm opacity-70">
          No events today. If you expected some, connect Google Calendar in{" "}
          <Link href="/settings" className="underline">
            Settings
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {today.map((e) => (
            <li key={e.id} className="flex items-start gap-2 text-sm">
              <span
                aria-hidden="true"
                className="mt-1.5 size-2 shrink-0 rounded-full"
                style={{ backgroundColor: e.color }}
              />
              <span className="w-16 shrink-0 text-xs opacity-60 tabular-nums">{eventTime(e)}</span>
              <span className="min-w-0 flex-1 truncate">{e.title}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Unread Inbox                                                        */
/* ------------------------------------------------------------------ */

function InboxCard({ meId }: { meId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [n, p] = await Promise.all([
      supabase
        .from("notifications")
        .select(NOTIFICATION_SELECT, { count: "exact" })
        .eq("user_id", meId)
        .is("read_at", null)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase.from("profiles").select("id,name"),
    ]);
    setRows((n.data ?? []) as unknown as NotificationRow[]);
    setCount(n.count ?? 0);
    setNames(new Map(((p.data ?? []) as Pick<Profile, "id" | "name">[]).map((x) => [x.id, x.name])));
    setLoading(false);
  }, [supabase, meId]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    const channel = supabase
      .channel(`home-inbox-${meId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${meId}` },
        () => load()
      )
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [supabase, meId, load]);

  async function open(row: NotificationRow) {
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("user_id", meId);
    if (row.task) router.push(`/p/${row.task.project_id}?task=${row.task.id}`);
    else load();
  }

  return (
    <section className={card} aria-labelledby="home-inbox">
      <div className="flex items-center justify-between gap-2">
        <h2 id="home-inbox" className={cardTitle}>
          Unread Inbox{count > 0 ? ` (${count})` : ""}
        </h2>
        <Link href="/inbox" className="text-xs underline opacity-70 hover:opacity-100">
          Open Inbox
        </Link>
      </div>
      {loading ? (
        <p className="mt-3 text-sm opacity-60">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm opacity-70">You are all caught up.</p>
      ) : (
        <ul className="mt-3 space-y-1">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => void open(r)}
                className="w-full rounded-md px-1 py-1.5 text-left text-sm hover:bg-current/5"
              >
                <span className="block truncate">{sentence(r, names.get(r.actor_id ?? "") ?? "Someone")}</span>
                <span className="block truncate text-xs opacity-60">
                  {r.task?.name ?? "A task"}
                  {r.task?.project?.name ? ` in ${r.task.project.name}` : ""} · {timeAgo(r.created_at)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Quick add and recent                                                */
/* ------------------------------------------------------------------ */

const RECENT_KEY = "jefi:recent-projects";

function QuickCard({ meId, projects }: { meId: string; projects: HomeProject[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [due, setDue] = useState("");
  const [mine, setMine] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<HomeProject[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const ids = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
        const byId = new Map(projects.map((p) => [p.id, p]));
        setRecent(ids.map((id) => byId.get(id)).filter((p): p is HomeProject => Boolean(p)).slice(0, 6));
      } catch {
        setRecent([]);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [projects]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !projectId) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const [first, last] = await Promise.all([
      supabase
        .from("project_statuses")
        .select("id")
        .eq("project_id", projectId)
        .order("position")
        .limit(1)
        .maybeSingle(),
      supabase
        .from("tasks")
        .select("position")
        .eq("project_id", projectId)
        .is("parent_task_id", null)
        .is("section_id", null)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const dueAt = due ? fromDateInputValue(due) : null;
    const { error } = await supabase.from("tasks").insert({
      project_id: projectId,
      name: trimmed,
      status_id: first.data?.id ?? null,
      assignee_id: mine ? meId : null,
      due_at: dueAt,
      due_has_time: false,
      position: ((last.data?.position as number | undefined) ?? 0) + 1000,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setName("");
    setDue("");
    const project = projects.find((p) => p.id === projectId);
    setMessage(`Added to ${project?.name ?? "the project"}.`);
  }

  return (
    <section className={card} aria-labelledby="home-quick">
      <h2 id="home-quick" className={cardTitle}>
        Quick add and recent
      </h2>
      {projects.length === 0 ? (
        <p className="mt-3 text-sm opacity-70">Create a project in the sidebar first, then add tasks here.</p>
      ) : (
        <form onSubmit={add} className="mt-3 space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Add a task"
            aria-label="New task name"
            className="w-full rounded-md border border-current/20 bg-transparent px-3 py-2 text-sm outline-none placeholder:opacity-50 focus:border-current/50"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              aria-label="Project"
              className="min-w-0 max-w-full rounded-md border border-current/20 bg-transparent px-2 py-1.5 text-sm"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id} className="text-black">
                  {p.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              aria-label="Due date"
              className="rounded-md border border-current/20 bg-transparent px-2 py-1.5 text-sm"
            />
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={mine}
                onChange={(e) => setMine(e.target.checked)}
                className="accent-accent"
              />
              Assign to me
            </label>
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="ml-auto rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </form>
      )}
      {message && (
        <p role="status" className="mt-2 text-sm">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-500">
          {error}
        </p>
      )}

      {recent.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-medium uppercase tracking-wide opacity-50">Recent projects</h3>
          <ul className="mt-1 grid gap-1 sm:grid-cols-2">
            {recent.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/p/${p.id}`}
                  className="flex items-center gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-current/5"
                >
                  <ProjectImage name={p.name} imageUrl={p.image_url} emoji={p.emoji} size={20} />
                  <span className="truncate">{p.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Good evening";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function Home({
  meId,
  myName,
  otherName,
  projects,
}: {
  meId: string;
  myName: string;
  otherName: string;
  projects: HomeProject[];
}) {
  const { personal, update } = usePersonal();
  const [error, setError] = useState<string | null>(null);
  const first = myName.split(/\s+/)[0] || myName;
  const dateText = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const on = (k: HomeSection) => personal.home[k];

  return (
    <div>
      <PageCover page="home" label="Home" containerClassName="mx-auto w-full max-w-4xl px-4 md:px-6" />
      <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting()}, {first}
          </h1>
          <p className="text-sm opacity-60">{dateText}</p>
          <PageIntro page="home" />
        </div>
        <Popover
          label="Choose what shows on Home"
          buttonClassName="rounded-md border border-current/20 px-3 py-1.5 text-sm hover:border-current/50"
          trigger="Customize"
          width={260}
        >
          {() => (
            <div>
              <p className="px-2 pb-2 text-xs opacity-60">Show on Home. Only you see this choice.</p>
              {HOME_SECTIONS.map((k) => (
                <label key={k} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-current/10">
                  <input
                    type="checkbox"
                    checked={on(k)}
                    onChange={async (e) => {
                      setError(null);
                      const err = await update((p) => ({
                        ...p,
                        home: { ...p.home, [k]: e.target.checked },
                      }));
                      if (err) setError(err);
                    }}
                    className="accent-accent"
                  />
                  {HOME_LABELS[k]}
                </label>
              ))}
            </div>
          )}
        </Popover>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-500">
          {error}
        </p>
      )}

      <div className="mt-5 space-y-4">
        {on("claude") && <ClaudeBox projects={projects} otherName={otherName} />}
        {(on("tasks") || on("calendar")) && (
          <div className="grid gap-4 md:grid-cols-2">
            {on("tasks") && <TasksCard meId={meId} />}
            {on("calendar") && <CalendarCard />}
          </div>
        )}
        {(on("inbox") || on("quick")) && (
          <div className="grid gap-4 md:grid-cols-2">
            {on("inbox") && <InboxCard meId={meId} />}
            {on("quick") && <QuickCard meId={meId} projects={projects} />}
          </div>
        )}
        {HOME_SECTIONS.every((k) => !on(k)) && (
          <p className="text-sm opacity-70">Everything is turned off. Press Customize to bring sections back.</p>
        )}
      </div>
    </div>
    </div>
  );
}
