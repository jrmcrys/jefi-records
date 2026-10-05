"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { timeAgo } from "@/lib/format";
import { PROFILE_COLUMNS, type Profile } from "@/lib/types";
import Avatar from "./Avatar";

type NotificationType = "mention" | "assigned" | "tag_comment" | "task_changed";

type Row = {
  id: string;
  type: NotificationType;
  task_id: string | null;
  comment_id: string | null;
  actor_id: string | null;
  read_at: string | null;
  created_at: string;
  data: { kind?: string; tag?: string; snippet?: string } | null;
  task: {
    id: string;
    name: string;
    project_id: string;
    project: { name: string } | null;
  } | null;
};

const SELECT =
  "id,type,task_id,comment_id,actor_id,read_at,created_at,data,task:tasks(id,name,project_id,project:projects(name))";

function sentence(row: Row, actor: string): string {
  const tag = row.data?.tag;
  switch (row.type) {
    case "mention":
      return `${actor} mentioned you in a comment`;
    case "assigned":
      return `${actor} assigned a task to you`;
    case "tag_comment":
      return `${actor} commented on a task tagged ${tag ?? "a tag you follow"}`;
    case "task_changed":
      return row.data?.kind === "tag"
        ? `${actor} added the tag ${tag ?? "you follow"} to a task`
        : `${actor} commented on a task assigned to you`;
  }
}

export default function Inbox({ meId }: { meId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [people, setPeople] = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onlyUnread, setOnlyUnread] = useState(false);

  const load = useCallback(async () => {
    const [n, p] = await Promise.all([
      supabase
        .from("notifications")
        .select(SELECT)
        .eq("user_id", meId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.from("profiles").select(PROFILE_COLUMNS),
    ]);
    if (n.error || p.error) {
      setError((n.error ?? p.error)?.message ?? "Could not load notifications.");
      setLoading(false);
      return;
    }
    setRows((n.data ?? []) as unknown as Row[]);
    setPeople(new Map(((p.data ?? []) as Profile[]).map((x) => [x.id, x])));
    setLoading(false);
  }, [supabase, meId]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    const channel = supabase
      .channel(`inbox-${meId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${meId}`,
        },
        () => load()
      )
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [supabase, meId, load]);

  async function markRead(ids: string[]) {
    if (ids.length === 0) return;
    const stamp = new Date().toISOString();
    setRows((rs) =>
      rs.map((r) => (ids.includes(r.id) && !r.read_at ? { ...r, read_at: stamp } : r))
    );
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: stamp })
      .in("id", ids)
      .eq("user_id", meId);
    if (error) {
      setError(error.message);
      load();
    }
  }

  async function open(row: Row) {
    if (!row.read_at) void markRead([row.id]);
    if (row.task) {
      router.push(`/p/${row.task.project_id}?task=${row.task.id}`);
    }
  }

  const unreadIds = rows.filter((r) => !r.read_at).map((r) => r.id);
  const shown = onlyUnread ? rows.filter((r) => !r.read_at) : rows;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
        <div className="flex items-center gap-2">
          <div
            role="radiogroup"
            aria-label="Filter notifications"
            className="flex overflow-hidden rounded-md border border-current/20 text-sm"
          >
            {(
              [
                [false, "All"],
                [true, "Unread"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={onlyUnread === value}
                onClick={() => setOnlyUnread(value)}
                className={`px-3 py-1.5 ${
                  onlyUnread === value ? "bg-accent/15 font-medium" : "opacity-70 hover:bg-current/10"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => markRead(unreadIds)}
            disabled={unreadIds.length === 0}
            className="rounded-md px-2 py-1.5 text-sm underline opacity-70 hover:opacity-100 disabled:no-underline disabled:opacity-30"
          >
            Mark all as read
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-500">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-6 text-sm opacity-60">Loading...</p>
      ) : shown.length === 0 ? (
        <p className="mt-10 text-center text-sm opacity-60">
          {onlyUnread
            ? "You are all caught up."
            : "Nothing here yet. Mentions, assignments, and followed tags show up in this list."}
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-current/10 rounded-lg border border-current/15">
          {shown.map((row) => {
            const actor = row.actor_id ? people.get(row.actor_id) : undefined;
            const unread = !row.read_at;
            const snippet = row.data?.snippet;
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => open(row)}
                  className={`flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-current/5 ${
                    unread ? "bg-accent/5" : ""
                  }`}
                >
                  <span className="mt-0.5">
                    <Avatar profile={actor ?? { name: "?" }} size={32} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${unread ? "font-medium" : ""}`}>
                      {sentence(row, actor?.name ?? "Someone")}
                    </span>
                    <span className="mt-0.5 block truncate text-sm opacity-80">
                      {row.task
                        ? `${row.task.name}${row.task.project ? ` in ${row.task.project.name}` : ""}`
                        : "This task is no longer available"}
                    </span>
                    {snippet && (
                      <span className="mt-1 block truncate text-xs opacity-60">
                        {snippet}
                      </span>
                    )}
                    <span className="mt-1 block text-xs opacity-50">
                      {timeAgo(row.created_at)}
                    </span>
                  </span>
                  {unread && (
                    <span
                      aria-label="Unread"
                      className="mt-2 size-2.5 shrink-0 rounded-full bg-accent"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
