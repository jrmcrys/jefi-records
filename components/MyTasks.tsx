"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { dueLabel } from "@/lib/dates";
import { TASK_COLUMNS, type Status, type Task } from "@/lib/types";
import { groupTasks, sortTasks, type DisplayGroup } from "@/lib/views";

type Row = Task & { project: { id: string; name: string; archived: boolean } };
type Show = "incomplete" | "completed" | "all";
type GroupBy = "due" | "project";

export default function MyTasks({ meId }: { meId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState<Show>("incomplete");
  const [groupBy, setGroupBy] = useState<GroupBy>("due");

  const load = useCallback(async () => {
    const t = await supabase
      .from("tasks")
      .select(`${TASK_COLUMNS},project:projects!inner(id,name,archived)`)
      .eq("assignee_id", meId);
    if (t.error) {
      setError(t.error.message);
      setLoading(false);
      return;
    }
    const list = ((t.data ?? []) as unknown as Row[]).filter(
      (r) => !r.project.archived
    );
    const projectIds = [...new Set(list.map((r) => r.project_id))];
    const st = projectIds.length
      ? await supabase
          .from("project_statuses")
          .select("id,project_id,name,color,position,is_done")
          .in("project_id", projectIds)
      : { data: [], error: null };
    if (st.error) {
      setError(st.error.message);
      setLoading(false);
      return;
    }
    setRows(list);
    setStatuses((st.data ?? []) as Status[]);
    setLoading(false);
  }, [supabase, meId]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(load, 300);
    };
    const channel = supabase
      .channel("my-tasks")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, schedule)
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [supabase, load]);

  async function toggleComplete(row: Row) {
    const mine = statuses.filter((s) => s.project_id === row.project_id);
    const completing = !row.completed_at;
    const target = completing
      ? mine.find((s) => s.is_done)
      : mine.filter((s) => !s.is_done).sort((a, b) => a.position - b.position)[0];
    const patch = {
      status_id: target?.id ?? row.status_id,
      completed_at: completing ? new Date().toISOString() : null,
    };
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...patch } : r)));
    const { error } = await supabase.from("tasks").update(patch).eq("id", row.id);
    if (error) {
      setError(error.message);
      load();
    }
  }

  const groups: DisplayGroup[] = useMemo(() => {
    const visible = rows.filter((r) =>
      show === "all" ? true : show === "completed" ? r.completed_at : !r.completed_at
    );
    const ctx = { meId, statuses, profiles: [], tagIdsOf: () => [] as string[] };
    if (groupBy === "due") {
      return groupTasks(
        sortTasks(visible, { key: "due", dir: "asc" }, ctx),
        "due",
        [],
        ctx,
        []
      );
    }
    const byProject = new Map<string, Row[]>();
    for (const r of visible) {
      const list = byProject.get(r.project_id) ?? [];
      list.push(r);
      byProject.set(r.project_id, list);
    }
    return [...byProject.entries()]
      .sort((a, b) => a[1][0].project.name.localeCompare(b[1][0].project.name))
      .map(([id, list]) => ({
        id: `project:${id}`,
        label: list[0].project.name,
        tasks: sortTasks(list, { key: "due", dir: "asc" }, ctx),
      }));
  }, [rows, show, groupBy, meId, statuses]);

  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-6">
      <h1 className="px-1.5 py-1 text-2xl font-semibold tracking-tight">My tasks</h1>
      <p className="px-1.5 text-xs opacity-60">
        Everything assigned to you, across all of your projects.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="Show" className="flex overflow-hidden rounded-md border border-current/20 text-sm">
          {(
            [
              ["incomplete", "Incomplete"],
              ["completed", "Completed"],
              ["all", "All"],
            ] as [Show, string][]
          ).map(([value, text]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={show === value}
              onClick={() => setShow(value)}
              className={`px-3 py-1.5 ${
                show === value ? "bg-accent/15 font-medium" : "hover:bg-current/10"
              }`}
            >
              {text}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="opacity-70">Group by</span>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupBy)}
            className="rounded-md border border-current/20 bg-background px-2 py-1.5 text-sm text-foreground"
          >
            <option value="due">Due date</option>
            <option value="project">Project</option>
          </select>
        </label>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-500">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-6 text-sm opacity-60">Loading...</p>
      ) : groups.length === 0 ? (
        <p className="mt-6 text-sm opacity-60">
          {show === "completed"
            ? "No completed tasks assigned to you yet."
            : "Nothing assigned to you. Enjoy the quiet."}
        </p>
      ) : (
        groups.map((g) => (
          <section key={g.id} className="mt-6">
            <h2 className="px-1.5 py-1 text-base font-semibold">
              {g.label}
              <span className="ml-2 text-xs font-normal opacity-50">{g.tasks.length}</span>
            </h2>
            <ul className="border-t border-current/10">
              {g.tasks.map((t) => {
                const row = byId.get(t.id);
                if (!row) return null;
                const done = Boolean(row.completed_at);
                const due = row.due_at ? dueLabel(row.due_at, done, row.due_has_time) : null;
                return (
                  <li
                    key={row.id}
                    className="flex items-center gap-3 border-b border-current/10 px-1.5 py-2"
                  >
                    <input
                      type="checkbox"
                      checked={done}
                      onChange={() => toggleComplete(row)}
                      aria-label={done ? "Mark as not done" : "Mark as done"}
                      className="size-4 shrink-0 accent-accent"
                    />
                    <Link
                      href={`/p/${row.project_id}?task=${row.id}`}
                      className={`min-w-0 flex-1 truncate text-sm hover:underline ${
                        done ? "line-through opacity-50" : ""
                      }`}
                    >
                      {row.name}
                    </Link>
                    {groupBy === "due" && (
                      <span className="hidden max-w-40 shrink-0 truncate rounded-full border border-current/20 px-2 py-0.5 text-xs opacity-70 sm:inline">
                        {row.project.name}
                      </span>
                    )}
                    {due && (
                      <span
                        className={`shrink-0 text-xs ${
                          due.tone === "overdue"
                            ? "text-red-500"
                            : due.tone === "soon"
                              ? "text-green-600"
                              : "opacity-70"
                        }`}
                      >
                        {due.text}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
