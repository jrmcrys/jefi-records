"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { createClient } from "@/lib/supabase/client";
import { dueLabel } from "@/lib/dates";
import { fileSize, fullDateTime, shortDate, timeAgo } from "@/lib/format";
import type { FieldDef, FieldValues, Profile, Status, Tag, Task } from "@/lib/types";
import AddInline from "./AddInline";
import AssigneePicker from "./AssigneePicker";
import ChipPicker from "./ChipPicker";
import FieldCell from "./FieldCell";
import Avatar from "./Avatar";
import DueDate from "./DueDate";
import Menu, { MenuItem } from "./Menu";
import RichEditor, { RichContent, mentionIds } from "./RichEditor";
import type { ColumnVisibility } from "./TaskRow";

type CommentRow = {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  mentions: string[] | null;
  created_at: string;
  edited_at: string | null;
};

type AttachmentRow = {
  id: string;
  task_id: string | null;
  comment_id: string | null;
  file_path: string;
  name: string;
  size: number | null;
  uploaded_by: string | null;
  created_at: string;
};

type ActivityRow = {
  id: string;
  task_id: string;
  actor_id: string | null;
  type: string;
  data: Record<string, unknown> | null;
  created_at: string;
};

type ViewRow = { task_id: string; user_id: string; last_seen_at: string };

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const COMMENT_COLUMNS = "id,task_id,author_id,body,mentions,created_at,edited_at";
const ATTACHMENT_COLUMNS =
  "id,task_id,comment_id,file_path,name,size,uploaded_by,created_at";

function safeFileName(name: string) {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-120) || "file";
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide opacity-60">
      {children}
    </h3>
  );
}

function FileChip({
  file,
  onOpen,
  onRemove,
}: {
  file: { name: string; size: number | null };
  onOpen?: () => void;
  onRemove?: () => void;
}) {
  return (
    <li className="flex items-center gap-2 rounded-md border border-current/15 px-2.5 py-1.5 text-sm">
      <svg
        viewBox="0 0 16 16"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        aria-hidden="true"
        className="shrink-0 opacity-60"
      >
        <path d="M9.5 2H4.5A1.5 1.5 0 003 3.5v9A1.5 1.5 0 004.5 14h7a1.5 1.5 0 001.5-1.5V5.5L9.5 2z" />
        <path d="M9.5 2v3.5H13" />
      </svg>
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 truncate text-left hover:underline"
        >
          {file.name}
        </button>
      ) : (
        <span className="min-w-0 flex-1 truncate">{file.name}</span>
      )}
      <span className="shrink-0 text-xs opacity-50">{fileSize(file.size)}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${file.name}`}
          onClick={onRemove}
          className="flex size-6 shrink-0 items-center justify-center rounded text-base leading-none opacity-60 hover:bg-current/10 hover:opacity-100"
        >
          {"×"}
        </button>
      )}
    </li>
  );
}

export default function TaskPanel({
  task,
  parent,
  subtasks,
  meId,
  statuses,
  profiles,
  assignableIds,
  columns,
  fields,
  values,
  tags,
  allTags,
  onField,
  onToggleTag,
  onCreateTag,
  onManageTags,
  onClose,
  onOpenTask,
  onUpdate,
  onStatus,
  onToggleComplete,
  onAddSubtask,
  onDelete,
}: {
  task: Task;
  parent: Task | null;
  subtasks: Task[];
  meId: string;
  statuses: Status[];
  profiles: Profile[];
  assignableIds?: string[];
  columns: ColumnVisibility;
  fields: FieldDef[];
  values: FieldValues;
  tags: Tag[];
  allTags: Tag[];
  onField: (fieldId: string, value: unknown) => void;
  onToggleTag: (tagId: string) => void;
  onCreateTag: (name: string) => void | Promise<void>;
  onManageTags: () => void;
  onClose: () => void;
  onOpenTask: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onStatus: (task: Task, statusId: string) => void;
  onToggleComplete: (task: Task) => void;
  onAddSubtask: (name: string) => void;
  onDelete: (task: Task) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const taskId = task.id;
  const done = Boolean(task.completed_at);
  const status = statuses.find((s) => s.id === task.status_id);

  const panelRef = useRef<HTMLDivElement>(null);
  const [description, setDescription] = useState<string | null>(null);
  const savedDescription = useRef("");
  const pendingDescription = useRef<string | null>(null);
  const descTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [comments, setComments] = useState<CommentRow[]>([]);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [views, setViews] = useState<ViewRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showAllActivity, setShowAllActivity] = useState(false);

  const [composerHtml, setComposerHtml] = useState("");
  const [composerKey, setComposerKey] = useState(0);
  const [composerFiles, setComposerFiles] = useState<File[]>([]);
  const [posting, setPosting] = useState(false);
  const composerEditor = useRef<Editor | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editHtml, setEditHtml] = useState("");
  const editEditor = useRef<Editor | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);
  const commentFileInput = useRef<HTMLInputElement>(null);

  const people = useMemo(
    () =>
      assignableIds
        ? profiles.filter((p) => assignableIds.includes(p.id))
        : profiles,
    [profiles, assignableIds]
  );
  const profileById = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles]
  );
  const nameOf = useCallback(
    (id: string | null | undefined) => {
      if (!id) return "Someone";
      if (id === meId) return "You";
      return profileById.get(id)?.name ?? "Someone";
    },
    [profileById, meId]
  );

  /* loading */

  const loadThread = useCallback(async () => {
    const [c, a, act, v] = await Promise.all([
      supabase
        .from("comments")
        .select(COMMENT_COLUMNS)
        .eq("task_id", taskId)
        .order("created_at"),
      supabase
        .from("attachments")
        .select(ATTACHMENT_COLUMNS)
        .eq("task_id", taskId)
        .order("created_at"),
      supabase
        .from("task_activity")
        .select("id,task_id,actor_id,type,data,created_at")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("task_views")
        .select("task_id,user_id,last_seen_at")
        .eq("task_id", taskId),
    ]);
    const err = c.error ?? a.error ?? act.error ?? v.error;
    if (err) {
      setError(err.message);
      return;
    }
    setComments((c.data ?? []) as CommentRow[]);
    setAttachments((a.data ?? []) as AttachmentRow[]);
    setActivity((act.data ?? []) as ActivityRow[]);
    setViews((v.data ?? []) as ViewRow[]);
  }, [supabase, taskId]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("description")
        .eq("id", taskId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setError(error.message);
        return;
      }
      const html = (data?.description as string | null) ?? "";
      savedDescription.current = html;
      setDescription(html);
      await loadThread();
      if (cancelled) return;
      const seen = await supabase.rpc("mark_task_seen", { tid: taskId });
      if (!cancelled && !seen.error) loadThread();
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [supabase, taskId, loadThread]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(loadThread, 250);
    };
    const filter = `task_id=eq.${taskId}`;
    const channel = supabase
      .channel(`task-panel-${taskId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments", filter }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "attachments", filter }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_activity", filter }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_views", filter }, schedule)
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [supabase, taskId, loadThread]);

  /* description autosave */

  const saveDescription = useCallback(async () => {
    clearTimeout(descTimer.current);
    const html = pendingDescription.current;
    if (html === null || html === savedDescription.current) {
      pendingDescription.current = null;
      return;
    }
    pendingDescription.current = null;
    savedDescription.current = html;
    const { error } = await supabase
      .from("tasks")
      .update({ description: html })
      .eq("id", taskId);
    if (error) setError(error.message);
  }, [supabase, taskId]);

  useEffect(() => {
    return () => {
      void saveDescription();
    };
  }, [saveDescription]);

  function onDescriptionChange(html: string) {
    pendingDescription.current = html;
    clearTimeout(descTimer.current);
    descTimer.current = setTimeout(() => void saveDescription(), 1200);
  }

  /* focus and keyboard */

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => {
      previous?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("[role='listbox'],[role='menu']")) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  /* attachments */

  async function uploadFile(file: File, commentId: string | null) {
    if (file.size > MAX_FILE_BYTES) {
      setError(`"${file.name}" is larger than 25 MB and was not uploaded.`);
      return false;
    }
    const path = `${taskId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    const up = await supabase.storage
      .from("attachments")
      .upload(path, file, { contentType: file.type || undefined });
    if (up.error) {
      setError(up.error.message);
      return false;
    }
    const ins = await supabase.from("attachments").insert({
      task_id: taskId,
      comment_id: commentId,
      file_path: path,
      name: file.name,
      size: file.size,
      uploaded_by: meId,
    });
    if (ins.error) {
      await supabase.storage.from("attachments").remove([path]);
      setError(ins.error.message);
      return false;
    }
    return true;
  }

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    for (const file of files) await uploadFile(file, null);
    setUploading(false);
    loadThread();
  }

  async function openAttachment(att: AttachmentRow) {
    const popup = window.open("", "_blank");
    const { data, error } = await supabase.storage
      .from("attachments")
      .createSignedUrl(att.file_path, 120);
    if (error || !data) {
      popup?.close();
      setError(error?.message ?? "Could not open that file.");
      return;
    }
    if (popup) popup.location.href = data.signedUrl;
    else window.location.assign(data.signedUrl);
  }

  async function removeAttachment(att: AttachmentRow) {
    if (!window.confirm(`Remove "${att.name}"?`)) return;
    setAttachments((prev) => prev.filter((a) => a.id !== att.id));
    const rm = await supabase.storage.from("attachments").remove([att.file_path]);
    if (rm.error) setError(rm.error.message);
    const del = await supabase.from("attachments").delete().eq("id", att.id);
    if (del.error) setError(del.error.message);
    loadThread();
  }

  /* comments */

  async function postComment() {
    const html = composerHtml.trim();
    if (!html || posting) return;
    setPosting(true);
    setError(null);
    const ids = composerEditor.current ? mentionIds(composerEditor.current) : [];
    const { data, error } = await supabase
      .from("comments")
      .insert({ task_id: taskId, author_id: meId, body: html, mentions: ids })
      .select("id")
      .single();
    if (error || !data) {
      setError(error?.message ?? "Could not post the comment.");
      setPosting(false);
      return;
    }
    for (const file of composerFiles) await uploadFile(file, data.id as string);
    setComposerHtml("");
    setComposerFiles([]);
    setComposerKey((k) => k + 1);
    setPosting(false);
    loadThread();
  }

  function startEdit(c: CommentRow) {
    setEditingId(c.id);
    setEditHtml(c.body);
  }

  async function saveEdit(c: CommentRow) {
    const html = editHtml.trim();
    if (!html) return;
    const ids = editEditor.current ? mentionIds(editEditor.current) : [];
    const { error } = await supabase
      .from("comments")
      .update({ body: html, mentions: ids, edited_at: new Date().toISOString() })
      .eq("id", c.id);
    if (error) {
      setError(error.message);
      return;
    }
    setEditingId(null);
    loadThread();
  }

  async function deleteComment(c: CommentRow) {
    if (!window.confirm("Delete this comment?")) return;
    const files = attachments.filter((a) => a.comment_id === c.id);
    if (files.length) {
      await supabase.storage
        .from("attachments")
        .remove(files.map((f) => f.file_path));
    }
    setComments((prev) => prev.filter((x) => x.id !== c.id));
    const { error } = await supabase.from("comments").delete().eq("id", c.id);
    if (error) setError(error.message);
    loadThread();
  }

  /* derived */

  const taskFiles = attachments.filter((a) => !a.comment_id);
  const others = people.filter((p) => p.id !== meId);
  const seenBy = others
    .map((p) => ({
      profile: p,
      seenAt: views.find((v) => v.user_id === p.id)?.last_seen_at ?? null,
    }))
    .filter((x) => x.seenAt);

  const timeline = useMemo(() => {
    type Entry = { id: string; at: string; text: string; muted?: boolean };
    const entries: Entry[] = [];
    for (const row of activity) {
      const who = nameOf(row.actor_id);
      const d = row.data ?? {};
      const from = asText(d.from);
      const to = asText(d.to);
      let text: string | null = null;
      let muted = false;
      switch (row.type) {
        case "created":
          text = `${who} created this ${d.subtask ? "subtask" : "task"}`;
          break;
        case "renamed":
          text = `${who} renamed it from "${from ?? ""}" to "${to ?? ""}"`;
          break;
        case "status":
          text = `${who} changed the status${from ? ` from ${from}` : ""} to ${to ?? "none"}`;
          break;
        case "assignee":
          text = to
            ? `${who} assigned it to ${to}`
            : `${who} removed the assignee${from ? ` (${from})` : ""}`;
          break;
        case "due":
          text = to
            ? `${who} set the due date to ${shortDate(to)}${from ? ` (was ${shortDate(from)})` : ""}`
            : `${who} cleared the due date`;
          break;
        case "completed":
          text = `${who} marked it complete`;
          break;
        case "reopened":
          text = `${who} reopened it`;
          break;
        case "description":
          text = `${who} edited the description`;
          break;
        case "attachment":
          if (d.comment_id) break;
          text = `${who} attached ${asText(d.name) ?? "a file"}`;
          break;
        case "viewed":
          text = `${who} opened this task`;
          muted = true;
          break;
        case "duplicated": {
          const next = asText(d.due);
          text = `Repeating task: ${who} completed it and the next one was created${next ? ` for ${shortDate(next)}` : ""}`;
          break;
        }
      }
      if (text) entries.push({ id: row.id, at: row.created_at, text, muted });
    }
    for (const c of comments) {
      entries.push({
        id: `c-${c.id}`,
        at: c.created_at,
        text: `${nameOf(c.author_id)} commented`,
      });
    }
    return entries.sort((a, b) => b.at.localeCompare(a.at));
  }, [activity, comments, nameOf]);

  const visibleTimeline = showAllActivity ? timeline : timeline.slice(0, 8);
  const subtaskDone = subtasks.filter((s) => s.completed_at).length;

  const fieldLabel = "w-24 shrink-0 text-sm opacity-60";

  return (
    <div className="fixed inset-0 z-[60]">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Task details"
        className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col overflow-y-auto border-l border-current/15 bg-background shadow-2xl outline-none"
      >
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-current/10 bg-background px-4 py-3">
          <button
            type="button"
            onClick={() => onToggleComplete(task)}
            className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${
              done
                ? "border-green-600/50 bg-green-600/10 text-green-700 dark:text-green-400"
                : "border-current/25 hover:border-current/50"
            }`}
          >
            <span aria-hidden="true">{done ? "✓" : "○"}</span>
            {done ? "Completed" : "Mark complete"}
          </button>
          <div className="flex-1" />
          <Menu label="Task actions">
            <MenuItem onClick={() => onDelete(task)} danger>
              Delete task
            </MenuItem>
          </Menu>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close task"
            className="flex size-9 items-center justify-center rounded-md text-xl leading-none opacity-70 hover:bg-current/10 hover:opacity-100"
          >
            {"×"}
          </button>
        </div>

        <div className="space-y-6 px-4 py-5">
          {error && (
            <div
              role="alert"
              className="flex items-start justify-between gap-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm"
            >
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                className="shrink-0 underline"
              >
                Dismiss
              </button>
            </div>
          )}

          <div>
            {parent && (
              <button
                type="button"
                onClick={() => onOpenTask(parent.id)}
                className="mb-1 block max-w-full truncate text-xs opacity-60 hover:underline hover:opacity-100"
              >
                {"← Subtask of "}
                {parent.name}
              </button>
            )}
            <input
              key={`${task.id}:${task.name}`}
              defaultValue={task.name}
              aria-label="Task name"
              onBlur={(e) => {
                const value = e.target.value.trim();
                if (!value) e.target.value = task.name;
                else if (value !== task.name) onUpdate(task.id, { name: value });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className={`w-full rounded bg-transparent px-1.5 py-1 text-2xl font-semibold tracking-tight outline-none focus:bg-current/5 ${
                done ? "line-through opacity-60" : ""
              }`}
            />
          </div>

          <div className="space-y-3">
            {columns.status && (
              <div className="flex items-center gap-3">
                <span className={fieldLabel}>Status</span>
                <div className="relative w-48">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-2.5 top-1/2 size-2.5 -translate-y-1/2 rounded-full"
                    style={{ backgroundColor: status?.color ?? "#71717a" }}
                  />
                  <select
                    value={task.status_id ?? ""}
                    onChange={(e) => onStatus(task, e.target.value)}
                    aria-label="Status"
                    className="w-full appearance-none truncate rounded-md border border-current/20 bg-background py-1.5 pl-7 pr-8 text-sm text-foreground"
                  >
                    {task.status_id === null && <option value="">No status</option>}
                    {statuses.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    width="12"
                    height="12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 opacity-60"
                  >
                    <path d="M4 6l4 4 4-4" />
                  </svg>
                </div>
              </div>
            )}
            {columns.assignee && (
              <div className="flex items-center gap-3">
                <span className={fieldLabel}>Assignee</span>
                <AssigneePicker
                  profiles={profiles}
                  assignableIds={assignableIds}
                  value={task.assignee_id}
                  onChange={(id) => onUpdate(task.id, { assignee_id: id })}
                />
              </div>
            )}
            {columns.due && (
              <div className="flex items-center gap-3">
                <span className={fieldLabel}>Due date</span>
                <div className="w-48">
                  <DueDate
                    value={task.due_at}
                    hasTime={task.due_has_time}
                    recurrence={task.recurrence}
                    done={done}
                    onChange={(patch) => onUpdate(task.id, patch)}
                  />
                </div>
              </div>
            )}
            {columns.tags && (
              <div className="flex items-start gap-3">
                <span className={`${fieldLabel} pt-1.5`}>Tags</span>
                <div className="min-w-0 flex-1">
                  <ChipPicker
                    label="Tags"
                    options={allTags}
                    selected={tags.map((t) => t.id)}
                    emptyLabel="Add tags"
                    onToggle={onToggleTag}
                    onCreate={onCreateTag}
                    onManage={onManageTags}
                    createLabel="Create tag"
                  />
                </div>
              </div>
            )}
            {fields.map((f) => (
              <div key={f.id} className="flex items-start gap-3">
                <span className={`${fieldLabel} truncate pt-1.5`} title={f.name}>
                  {f.name}
                </span>
                <div className="min-w-0 flex-1">
                  <FieldCell
                    field={f}
                    value={values[f.id]}
                    profiles={profiles}
                    assignableIds={assignableIds}
                    onChange={(v) => onField(f.id, v)}
                  />
                </div>
              </div>
            ))}
            {task.due_at && !columns.due && (
              <p className="text-sm opacity-60">
                Due {dueLabel(task.due_at, done, task.due_has_time).text}
              </p>
            )}
          </div>

          <section aria-label="Description" className="space-y-2">
            <SectionTitle>Description</SectionTitle>
            {description === null ? (
              <div className="h-32 rounded-md border border-current/15" />
            ) : (
              <RichEditor
                value={description}
                placeholder="Add a description"
                minHeight={110}
                onChange={onDescriptionChange}
                onBlur={(html) => {
                  pendingDescription.current = html;
                  void saveDescription();
                }}
              />
            )}
          </section>

          {!parent && (
            <section aria-label="Subtasks" className="space-y-2">
              <SectionTitle>
                Subtasks
                {subtasks.length > 0 && (
                  <span className="ml-2 font-normal normal-case opacity-70">
                    {subtaskDone} of {subtasks.length} done
                  </span>
                )}
              </SectionTitle>
              {subtasks.length > 0 && (
                <ul className="divide-y divide-current/10 rounded-md border border-current/15">
                  {subtasks.map((s) => {
                    const sDone = Boolean(s.completed_at);
                    const assignee = profileById.get(s.assignee_id ?? "");
                    return (
                      <li key={s.id} className="flex items-center gap-2 px-2.5 py-1.5">
                        <input
                          type="checkbox"
                          checked={sDone}
                          onChange={() => onToggleComplete(s)}
                          aria-label={sDone ? "Mark as not done" : "Mark as done"}
                          className="size-4 shrink-0 accent-accent"
                        />
                        <button
                          type="button"
                          onClick={() => onOpenTask(s.id)}
                          className={`min-w-0 flex-1 truncate py-1 text-left text-sm hover:underline ${
                            sDone ? "line-through opacity-50" : ""
                          }`}
                        >
                          {s.name}
                        </button>
                        {s.due_at && (
                          <span className="shrink-0 text-xs opacity-60">
                            {dueLabel(s.due_at, sDone, s.due_has_time).text}
                          </span>
                        )}
                        {assignee && <Avatar profile={assignee} size={20} />}
                      </li>
                    );
                  })}
                </ul>
              )}
              <AddInline
                placeholder="Add a subtask"
                className="rounded-md border border-dashed border-current/20"
                onAdd={onAddSubtask}
              />
            </section>
          )}

          <section aria-label="Attachments" className="space-y-2">
            <div className="flex items-center justify-between">
              <SectionTitle>Attachments</SectionTitle>
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInput.current?.click()}
                className="rounded-md border border-current/20 px-2.5 py-1 text-xs hover:border-current/50 disabled:opacity-50"
              >
                {uploading ? "Uploading..." : "Add file"}
              </button>
              <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                onChange={onPickFiles}
              />
            </div>
            {taskFiles.length > 0 ? (
              <ul className="space-y-1.5">
                {taskFiles.map((a) => (
                  <FileChip
                    key={a.id}
                    file={a}
                    onOpen={() => openAttachment(a)}
                    onRemove={() => removeAttachment(a)}
                  />
                ))}
              </ul>
            ) : (
              <p className="text-sm opacity-50">No files yet. Files can be up to 25 MB.</p>
            )}
          </section>

          <section aria-label="Comments" className="space-y-3">
            <SectionTitle>
              Comments
              {comments.length > 0 && (
                <span className="ml-2 font-normal normal-case opacity-70">
                  {comments.length}
                </span>
              )}
            </SectionTitle>

            {comments.length > 0 && (
              <ul className="space-y-4">
                {comments.map((c) => {
                  const author = profileById.get(c.author_id);
                  const files = attachments.filter((a) => a.comment_id === c.id);
                  const mine = c.author_id === meId;
                  return (
                    <li key={c.id} className="flex gap-3">
                      <Avatar profile={author} size={28} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="text-sm font-medium">
                            {mine ? "You" : (author?.name ?? "Someone")}
                          </span>
                          <time
                            dateTime={c.created_at}
                            title={fullDateTime(c.created_at)}
                            className="text-xs opacity-50"
                          >
                            {timeAgo(c.created_at)}
                          </time>
                          {c.edited_at && (
                            <span className="text-xs opacity-50">edited</span>
                          )}
                          {mine && editingId !== c.id && (
                            <span className="ml-auto flex gap-3 text-xs opacity-60">
                              <button
                                type="button"
                                onClick={() => startEdit(c)}
                                className="underline hover:opacity-100"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteComment(c)}
                                className="underline hover:opacity-100"
                              >
                                Delete
                              </button>
                            </span>
                          )}
                        </div>
                        {editingId === c.id ? (
                          <div className="mt-1 space-y-2">
                            <RichEditor
                              value={c.body}
                              placeholder="Edit your comment"
                              minHeight={60}
                              people={people}
                              editorRef={editEditor}
                              onChange={setEditHtml}
                              onSubmit={() => saveEdit(c)}
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => saveEdit(c)}
                                className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="rounded-md border border-current/20 px-3 py-1.5 text-sm hover:border-current/50"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-0.5">
                            <RichContent html={c.body} />
                          </div>
                        )}
                        {files.length > 0 && (
                          <ul className="mt-2 space-y-1.5">
                            {files.map((a) => (
                              <FileChip
                                key={a.id}
                                file={a}
                                onOpen={() => openAttachment(a)}
                                onRemove={
                                  a.uploaded_by === meId
                                    ? () => removeAttachment(a)
                                    : undefined
                                }
                              />
                            ))}
                          </ul>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="space-y-2">
              <RichEditor
                key={composerKey}
                value=""
                placeholder="Write a comment"
                minHeight={60}
                people={people}
                editorRef={composerEditor}
                onChange={setComposerHtml}
                onSubmit={postComment}
              />
              {composerFiles.length > 0 && (
                <ul className="space-y-1.5">
                  {composerFiles.map((f, i) => (
                    <FileChip
                      key={`${f.name}-${i}`}
                      file={{ name: f.name, size: f.size }}
                      onRemove={() =>
                        setComposerFiles((prev) => prev.filter((_, j) => j !== i))
                      }
                    />
                  ))}
                </ul>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={postComment}
                  disabled={!composerHtml.trim() || posting}
                  className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {posting ? "Posting..." : "Comment"}
                </button>
                <button
                  type="button"
                  onClick={() => commentFileInput.current?.click()}
                  className="rounded-md border border-current/20 px-3 py-1.5 text-sm hover:border-current/50"
                >
                  Attach file
                </button>
                <input
                  ref={commentFileInput}
                  type="file"
                  multiple
                  hidden
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    e.target.value = "";
                    setComposerFiles((prev) => [...prev, ...files]);
                  }}
                />
                <span className="ml-auto hidden text-xs opacity-50 sm:inline">
                  Cmd+Enter to post
                </span>
              </div>
            </div>
          </section>

          <section aria-label="Activity" className="space-y-2 border-t border-current/10 pt-5">
            <SectionTitle>Activity</SectionTitle>
            {others.length > 0 && (
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                {seenBy.length === 0 ? (
                  <span className="opacity-60">
                    Not seen by {others.map((p) => p.name).join(" or ")} yet
                  </span>
                ) : (
                  seenBy.map(({ profile, seenAt }) => (
                    <span key={profile.id} className="flex items-center gap-1.5">
                      <Avatar profile={profile} size={18} />
                      <span>
                        Seen by {profile.name}{" "}
                        <span
                          className="opacity-60"
                          title={seenAt ? fullDateTime(seenAt) : undefined}
                        >
                          {seenAt ? timeAgo(seenAt) : ""}
                        </span>
                      </span>
                    </span>
                  ))
                )}
              </p>
            )}
            <ul className="space-y-1.5">
              {visibleTimeline.map((e) => (
                <li
                  key={e.id}
                  className={`flex items-baseline justify-between gap-3 text-sm ${
                    e.muted ? "opacity-50" : "opacity-80"
                  }`}
                >
                  <span className="min-w-0">{e.text}</span>
                  <time
                    dateTime={e.at}
                    title={fullDateTime(e.at)}
                    className="shrink-0 text-xs opacity-70"
                  >
                    {timeAgo(e.at)}
                  </time>
                </li>
              ))}
              {timeline.length === 0 && (
                <li className="text-sm opacity-50">No activity yet.</li>
              )}
            </ul>
            {timeline.length > 8 && (
              <button
                type="button"
                onClick={() => setShowAllActivity((v) => !v)}
                className="text-xs underline opacity-70 hover:opacity-100"
              >
                {showAllActivity ? "Show less" : `Show all ${timeline.length}`}
              </button>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
