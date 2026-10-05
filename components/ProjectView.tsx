"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { createClient } from "@/lib/supabase/client";
import {
  parseProjectColors,
  projectStyle,
  type ProjectColors,
} from "@/lib/theme";
import {
  DEFAULT_VIEW,
  activeFilterCount,
  buildDisplay,
  parseView,
  type ViewConfig,
} from "@/lib/views";
import {
  FIELD_COLUMNS,
  PROFILE_COLUMNS,
  PROJECT_PAGE_COLUMNS,
  TASK_COLUMNS,
  type FieldDef,
  type FieldType,
  type FieldValues,
  type Tag,
  type Profile,
  type Project,
  type Section,
  type Status,
  type Task,
  type Visibility,
} from "@/lib/types";
import AddInline from "./AddInline";
import Menu, { MenuItem } from "./Menu";
import FieldsEditor from "./FieldsEditor";
import StatusEditor from "./StatusEditor";
import TagsEditor from "./TagsEditor";
import ProjectColorsEditor from "./ProjectColors";
import { useGoogleEvents, type EventRange } from "@/lib/useGoogleEvents";
import CalendarView from "./CalendarView";
import ViewToolbar, { type SavedView } from "./ViewToolbar";
import TaskPanel from "./TaskPanel";
import { SortableTask, TaskRow, type RowProps } from "./TaskRow";

type BuiltinKey = "status" | "assignee" | "due" | "tags";

/* "name", a built-in column, or "f:<field id>" for a custom column */
type ColKey = string;

type ColState = {
  widths: Record<string, number>;
  hidden: BuiltinKey[];
};

const BUILTINS: BuiltinKey[] = ["status", "assignee", "due", "tags"];

const COLUMN_LABELS: Record<BuiltinKey, string> = {
  status: "Status",
  assignee: "Assignee",
  due: "Due date",
  tags: "Tags",
};

const DEFAULT_COLS: ColState = { widths: {}, hidden: [] };

const BUILTIN_WIDTH: Record<BuiltinKey, number> = {
  status: 170,
  assignee: 190,
  due: 160,
  tags: 220,
};

const FIELD_WIDTH: Record<FieldType, number> = {
  dropdown: 170,
  multi_select: 220,
  text: 190,
  number: 130,
  url: 210,
  checkbox: 110,
  person: 190,
};

function minWidth(key: ColKey): number {
  if (key === "name") return 200;
  if (key === "status") return 120;
  if (key === "assignee") return 130;
  return 110;
}

const MAX_WIDTH = 640;
const NUM_WIDTH = 72;
const ACTION_WIDTH = 48;
const NAME_FLEX_MIN = 260;

function colsStorageKey(projectId: string) {
  return `jefi:columns:${projectId}`;
}

function readCols(projectId: string): ColState {
  if (typeof window === "undefined") return DEFAULT_COLS;
  try {
    const raw = window.localStorage.getItem(colsStorageKey(projectId));
    if (!raw) return DEFAULT_COLS;
    const parsed = JSON.parse(raw) as Partial<ColState>;
    const w = (parsed.widths ?? {}) as Record<string, unknown>;
    const widths: Record<string, number> = {};
    for (const [key, value] of Object.entries(w)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        widths[key] = Math.min(MAX_WIDTH, Math.max(minWidth(key), value));
      }
    }
    return {
      widths,
      hidden: (Array.isArray(parsed.hidden) ? parsed.hidden : []).filter(
        (k): k is BuiltinKey => BUILTINS.includes(k as BuiltinKey)
      ),
    };
  } catch {
    return DEFAULT_COLS;
  }
}

type Layout = "list" | "calendar";

function layoutStorageKey(projectId: string) {
  return `jefi:layout:${projectId}`;
}

function readLayout(projectId: string): Layout {
  if (typeof window === "undefined") return "list";
  try {
    return window.localStorage.getItem(layoutStorageKey(projectId)) === "calendar"
      ? "calendar"
      : "list";
  } catch {
    return "list";
  }
}

function viewStorageKey(projectId: string) {
  return `jefi:view:${projectId}`;
}

function readView(projectId: string): ViewConfig {
  if (typeof window === "undefined") return DEFAULT_VIEW;
  try {
    const raw = window.localStorage.getItem(viewStorageKey(projectId));
    return raw ? parseView(JSON.parse(raw)) : DEFAULT_VIEW;
  } catch {
    return DEFAULT_VIEW;
  }
}

const byPosition = (a: { position: number; created_at?: string }, b: { position: number; created_at?: string }) =>
  a.position - b.position ||
  (a.created_at ?? "").localeCompare(b.created_at ?? "");

function HeaderCell({
  label,
  colKey,
  onStart,
  onMove,
  onEnd,
  onKey,
}: {
  label: string;
  colKey: ColKey;
  onStart: (key: ColKey, e: React.PointerEvent<HTMLDivElement>) => void;
  onMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onEnd: () => void;
  onKey: (key: ColKey, e: React.KeyboardEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      role="columnheader"
      className="relative border-l border-current/10 px-3 py-2"
    >
      {label}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${label} column`}
        tabIndex={0}
        onPointerDown={(e) => onStart(colKey, e)}
        onPointerMove={onMove}
        onPointerUp={onEnd}
        onPointerCancel={onEnd}
        onKeyDown={(e) => onKey(colKey, e)}
        className="absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize touch-none hover:bg-accent/50 active:bg-accent"
      />
    </div>
  );
}

function DropContainer({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: `container:${id}` });
  return (
    <div ref={setNodeRef} className="min-h-10">
      {children}
    </div>
  );
}

export default function ProjectView({
  projectId,
  meId,
}: {
  projectId: string;
  meId: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [project, setProject] = useState<Project | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    new Set()
  );
  const [collapsedTasks, setCollapsedTasks] = useState<Set<string>>(new Set());
  const [addingSubFor, setAddingSubFor] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingStatuses, setEditingStatuses] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, FieldValues>>({});
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [taskTagIds, setTaskTagIds] = useState<Record<string, string[]>>({});
  const [followedTagIds, setFollowedTagIds] = useState<Set<string>>(new Set());
  const [view, setView] = useState<ViewConfig>(() => readView(projectId));
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [layout, setLayout] = useState<Layout>(() => readLayout(projectId));
  const [editingFields, setEditingFields] = useState(false);
  const [editingTags, setEditingTags] = useState(false);
  const [editingColors, setEditingColors] = useState(false);
  const [eventRange, setEventRange] = useState<EventRange | null>(null);
  const googleEvents = useGoogleEvents(layout === "calendar" ? eventRange : null);
  const [previewColors, setPreviewColors] = useState<ProjectColors | null>(null);
  const [cols, setCols] = useState<ColState>(() => readCols(projectId));
  const resizing = useRef<{
    key: ColKey;
    startX: number;
    startWidth: number;
  } | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(layoutStorageKey(projectId), layout);
    } catch {
      /* the layout simply will not be remembered */
    }
  }, [layout, projectId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(viewStorageKey(projectId), JSON.stringify(view));
    } catch {
      /* storage can be unavailable, the view simply will not be remembered */
    }
  }, [view, projectId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(colsStorageKey(projectId), JSON.stringify(cols));
    } catch {
      /* storage can be unavailable, the layout simply will not be remembered */
    }
  }, [cols, projectId]);

  /* the open task lives in the address (?task=id) so it survives a refresh and can be shared */

  useEffect(() => {
    const timer = setTimeout(() => {
      setOpenTaskId(new URLSearchParams(window.location.search).get("task"));
    }, 0);
    const onPop = () =>
      setOpenTaskId(new URLSearchParams(window.location.search).get("task"));
    window.addEventListener("popstate", onPop);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("popstate", onPop);
    };
  }, [projectId]);

  function openTask(id: string | null) {
    setOpenTaskId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("task", id);
    else url.searchParams.delete("task");
    window.history.replaceState(null, "", url.pathname + url.search);
  }

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const load = useCallback(async () => {
    const [p, s, st, t, pr, fd, fv, tg, tt, tf, sv] = await Promise.all([
      supabase
        .from("projects")
        .select(PROJECT_PAGE_COLUMNS)
        .eq("id", projectId)
        .maybeSingle(),
      supabase
        .from("sections")
        .select("id,project_id,name,position")
        .eq("project_id", projectId)
        .order("position"),
      supabase
        .from("project_statuses")
        .select("id,project_id,name,color,position,is_done")
        .eq("project_id", projectId)
        .order("position"),
      supabase
        .from("tasks")
        .select(TASK_COLUMNS)
        .eq("project_id", projectId)
        .order("position"),
      supabase.from("profiles").select(PROFILE_COLUMNS).order("name"),
      supabase
        .from("field_definitions")
        .select(FIELD_COLUMNS)
        .eq("project_id", projectId)
        .order("position"),
      supabase
        .from("task_field_values")
        .select("task_id,field_id,value,tasks!inner(project_id)")
        .eq("tasks.project_id", projectId),
      supabase.from("tags").select("id,name,color").order("name"),
      supabase
        .from("task_tags")
        .select("task_id,tag_id,tasks!inner(project_id)")
        .eq("tasks.project_id", projectId),
      supabase.from("tag_follows").select("tag_id").eq("user_id", meId),
      supabase
        .from("saved_views")
        .select("id,name,filters,sort,group_by,created_by")
        .eq("project_id", projectId)
        .order("created_at"),
    ]);
    const err =
      p.error ?? s.error ?? st.error ?? t.error ?? pr.error ?? fd.error ??
      fv.error ?? tg.error ?? tt.error ?? tf.error ?? sv.error;
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    setProject(p.data as Project | null);
    setSections((s.data ?? []) as Section[]);
    setStatuses((st.data ?? []) as Status[]);
    setTasks((t.data ?? []) as unknown as Task[]);
    setProfiles((pr.data ?? []) as Profile[]);
    setFields((fd.data ?? []) as unknown as FieldDef[]);
    const values: Record<string, FieldValues> = {};
    for (const row of (fv.data ?? []) as unknown as {
      task_id: string;
      field_id: string;
      value: unknown;
    }[]) {
      (values[row.task_id] ??= {})[row.field_id] = row.value;
    }
    setFieldValues(values);
    setAllTags((tg.data ?? []) as Tag[]);
    const tagMap: Record<string, string[]> = {};
    for (const row of (tt.data ?? []) as unknown as {
      task_id: string;
      tag_id: string;
    }[]) {
      (tagMap[row.task_id] ??= []).push(row.tag_id);
    }
    setTaskTagIds(tagMap);
    setSavedViews(
      ((sv.data ?? []) as unknown as {
        id: string;
        name: string;
        filters: unknown;
        sort: unknown;
        group_by: string;
        created_by: string | null;
      }[]).map((r) => ({
        id: r.id,
        name: r.name,
        created_by: r.created_by,
        view: parseView({ filters: r.filters, sort: r.sort, group: r.group_by }),
      }))
    );
    setFollowedTagIds(
      new Set(((tf.data ?? []) as { tag_id: string }[]).map((r) => r.tag_id))
    );
    setLoading(false);
  }, [supabase, projectId, meId]);

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
      .channel(`project-${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        schedule
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sections" },
        schedule
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_statuses" },
        schedule
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "projects" },
        schedule
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        schedule
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "field_definitions" },
        schedule
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_field_values" },
        schedule
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tags" },
        schedule
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_tags" },
        schedule
      )
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [supabase, projectId, load]);

  const sortedSections = useMemo(
    () => [...sections].sort(byPosition),
    [sections]
  );

  const { topBySection, childrenOf } = useMemo(() => {
    const top = new Map<string, Task[]>();
    const kids = new Map<string, Task[]>();
    for (const t of [...tasks].sort(byPosition)) {
      if (t.parent_task_id) {
        const list = kids.get(t.parent_task_id) ?? [];
        list.push(t);
        kids.set(t.parent_task_id, list);
      } else {
        const key = t.section_id ?? "none";
        const list = top.get(key) ?? [];
        list.push(t);
        top.set(key, list);
      }
    }
    return { topBySection: top, childrenOf: kids };
  }, [tasks]);

  /* task actions */

  async function updateTask(id: string, patch: Partial<Task>) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    const { error } = await supabase.from("tasks").update(patch).eq("id", id);
    if (error) {
      setError(error.message);
      load();
    }
  }

  async function addTask(
    sectionId: string | null,
    parentId: string | null,
    name: string
  ) {
    const parent = parentId ? tasks.find((t) => t.id === parentId) : undefined;
    const effectiveSection = parent ? parent.section_id : sectionId;
    const siblings = tasks.filter((t) =>
      parentId
        ? t.parent_task_id === parentId
        : !t.parent_task_id && t.section_id === effectiveSection
    );
    const position = siblings.reduce((m, t) => Math.max(m, t.position), 0) + 1000;
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        project_id: projectId,
        section_id: effectiveSection,
        parent_task_id: parentId,
        name,
        status_id: statuses[0]?.id ?? null,
        position,
      })
      .select(TASK_COLUMNS)
      .single();
    if (error || !data) {
      setError(error?.message ?? "Could not add the task.");
      return;
    }
    setTasks((prev) => [...prev, data as unknown as Task]);
  }

  async function deleteTask(task: Task): Promise<boolean> {
    const count = childrenOf.get(task.id)?.length ?? 0;
    const message = count
      ? `Delete "${task.name}" and its ${count} subtask${count === 1 ? "" : "s"}?`
      : `Delete "${task.name}"?`;
    if (!window.confirm(message)) return false;
    setTasks((prev) =>
      prev.filter((t) => t.id !== task.id && t.parent_task_id !== task.id)
    );
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    if (error) {
      setError(error.message);
      load();
      return false;
    }
    return true;
  }

  function setStatus(task: Task, statusId: string) {
    const s = statuses.find((x) => x.id === statusId);
    updateTask(task.id, {
      status_id: statusId,
      completed_at: s?.is_done ? (task.completed_at ?? new Date().toISOString()) : null,
    });
  }

  function toggleComplete(task: Task) {
    if (task.completed_at) {
      const open = statuses.find((s) => !s.is_done);
      updateTask(task.id, {
        status_id: open?.id ?? task.status_id,
        completed_at: null,
      });
    } else {
      const done = statuses.find((s) => s.is_done);
      updateTask(task.id, {
        status_id: done?.id ?? task.status_id,
        completed_at: new Date().toISOString(),
      });
    }
  }

  function toggleSet(
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    id: string
  ) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function setFieldValue(taskId: string, fieldId: string, value: unknown) {
    setFieldValues((prev) => ({
      ...prev,
      [taskId]: { ...(prev[taskId] ?? {}), [fieldId]: value },
    }));
    const { error } = await supabase
      .from("task_field_values")
      .upsert(
        { task_id: taskId, field_id: fieldId, value },
        { onConflict: "task_id,field_id" }
      );
    if (error) {
      setError(error.message);
      load();
    }
  }

  async function toggleTag(taskId: string, tagId: string) {
    const current = taskTagIds[taskId] ?? [];
    const has = current.includes(tagId);
    setTaskTagIds((prev) => ({
      ...prev,
      [taskId]: has ? current.filter((x) => x !== tagId) : [...current, tagId],
    }));
    const { error } = has
      ? await supabase
          .from("task_tags")
          .delete()
          .eq("task_id", taskId)
          .eq("tag_id", tagId)
      : await supabase.from("task_tags").insert({ task_id: taskId, tag_id: tagId });
    if (error) {
      setError(error.message);
      load();
    }
  }

  async function createTag(taskId: string, name: string) {
    const existing = allTags.find(
      (t) => t.name.toLowerCase() === name.toLowerCase()
    );
    if (existing) {
      if (!(taskTagIds[taskId] ?? []).includes(existing.id)) {
        await toggleTag(taskId, existing.id);
      }
      return;
    }
    const palette = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#9333ea", "#0891b2", "#db2777", "#71717a"];
    const { data, error } = await supabase
      .from("tags")
      .insert({ name, color: palette[allTags.length % palette.length] })
      .select("id,name,color")
      .single();
    if (error || !data) {
      setError(error?.message ?? "Could not create the tag.");
      return;
    }
    setAllTags((prev) => [...prev, data as Tag]);
    await toggleTag(taskId, (data as Tag).id);
  }

  async function saveView(name: string) {
    const { error } = await supabase.from("saved_views").insert({
      project_id: projectId,
      name,
      filters: view.filters,
      sort: view.sort,
      group_by: view.group,
    });
    if (error) setError(error.message);
    else load();
  }

  async function deleteView(id: string) {
    setSavedViews((prev) => prev.filter((v) => v.id !== id));
    const { error } = await supabase.from("saved_views").delete().eq("id", id);
    if (error) {
      setError(error.message);
      load();
    }
  }

  /* section actions */

  async function addSection(name: string) {
    const position =
      sections.reduce((m, s) => Math.max(m, s.position), 0) + 1000;
    const { data, error } = await supabase
      .from("sections")
      .insert({ project_id: projectId, name, position })
      .select("id,project_id,name,position")
      .single();
    if (error || !data) {
      setError(error?.message ?? "Could not add the section.");
      return;
    }
    setSections((prev) => [...prev, data as Section]);
  }

  async function renameSection(id: string, name: string) {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
    const { error } = await supabase
      .from("sections")
      .update({ name })
      .eq("id", id);
    if (error) {
      setError(error.message);
      load();
    }
  }

  async function deleteSection(section: Section) {
    const count = topBySection.get(section.id)?.length ?? 0;
    const message = count
      ? `Delete the section "${section.name}"? Its ${count} task${count === 1 ? "" : "s"} will move to the Tasks group.`
      : `Delete the section "${section.name}"?`;
    if (!window.confirm(message)) return;
    const { error } = await supabase
      .from("sections")
      .delete()
      .eq("id", section.id);
    if (error) setError(error.message);
    load();
  }

  async function moveSection(id: string, dir: -1 | 1) {
    const i = sortedSections.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= sortedSections.length) return;
    const a = sortedSections[i];
    const b = sortedSections[j];
    setSections((prev) =>
      prev.map((s) =>
        s.id === a.id
          ? { ...s, position: b.position }
          : s.id === b.id
            ? { ...s, position: a.position }
            : s
      )
    );
    const results = await Promise.all([
      supabase.from("sections").update({ position: b.position }).eq("id", a.id),
      supabase.from("sections").update({ position: a.position }).eq("id", b.id),
    ]);
    const err = results.find((r) => r.error)?.error;
    if (err) {
      setError(err.message);
      load();
    }
  }

  /* project actions */

  async function renameProject(name: string) {
    setProject((p) => (p ? { ...p, name } : p));
    const { error } = await supabase
      .from("projects")
      .update({ name })
      .eq("id", projectId);
    if (error) setError(error.message);
    else router.refresh();
  }

  async function changeVisibility(visibility: Visibility) {
    if (!project || project.visibility === visibility) return;
    const message =
      visibility === "private"
        ? "Make this project private? Only you will see it. Tasks assigned to others stay assigned, but they will no longer see the project."
        : "Share this project with everyone? Both of you will see and edit its tasks.";
    if (!window.confirm(message)) return;
    setProject({ ...project, visibility });
    const { error } = await supabase
      .from("projects")
      .update({ visibility })
      .eq("id", projectId);
    if (error) {
      setError(error.message);
      load();
    } else {
      router.refresh();
    }
  }

  async function archiveProject() {
    if (!window.confirm("Archive this project? You can restore it from the sidebar.")) return;
    const { error } = await supabase
      .from("projects")
      .update({ archived: true })
      .eq("id", projectId);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/");
    router.refresh();
  }

  /* drag and drop */

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;

    const activeTask = tasks.find((t) => t.id === active.id);
    if (!activeTask) return;

    const overId = String(over.id);
    let targetSection: string | null;
    let overTask: Task | undefined;

    if (overId.startsWith("container:")) {
      const c = overId.slice("container:".length);
      targetSection = c === "none" ? null : c;
    } else {
      overTask = tasks.find((t) => t.id === overId);
      if (!overTask || overTask.parent_task_id) return;
      targetSection = overTask.section_id;
    }

    const inTarget = tasks
      .filter((t) => !t.parent_task_id && t.section_id === targetSection)
      .sort(byPosition);
    const list = inTarget.filter((t) => t.id !== activeTask.id);

    let index = list.length;
    if (overTask) {
      const overIdx = list.findIndex((t) => t.id === overTask!.id);
      const sameContainer = activeTask.section_id === targetSection;
      const movingDown =
        sameContainer &&
        inTarget.findIndex((t) => t.id === activeTask.id) <
          inTarget.findIndex((t) => t.id === overTask!.id);
      index = overIdx + (movingDown ? 1 : 0);
    }

    const prev = list[index - 1];
    const next = list[index];
    const position =
      prev && next
        ? (prev.position + next.position) / 2
        : prev
          ? prev.position + 1000
          : next
            ? next.position - 1000
            : 1000;

    const sectionChanged = activeTask.section_id !== targetSection;

    setTasks((all) =>
      all.map((t) => {
        if (t.id === activeTask.id) {
          return { ...t, section_id: targetSection, position };
        }
        if (sectionChanged && t.parent_task_id === activeTask.id) {
          return { ...t, section_id: targetSection };
        }
        return t;
      })
    );

    (async () => {
      const first = await supabase
        .from("tasks")
        .update({ section_id: targetSection, position })
        .eq("id", activeTask.id);
      let err = first.error;
      if (!err && sectionChanged) {
        const second = await supabase
          .from("tasks")
          .update({ section_id: targetSection })
          .eq("parent_task_id", activeTask.id);
        err = second.error;
      }
      if (err) {
        setError(err.message);
        load();
      }
    })();
  }

  /* rendering */

  const display = useMemo(
    () =>
      buildDisplay({
        tasks,
        sections: sortedSections,
        view,
        ctx: {
          meId,
          statuses,
          profiles,
          tagIdsOf: (id) => taskTagIds[id] ?? [],
        },
        tags: allTags,
      }),
    [tasks, sortedSections, view, meId, statuses, profiles, taskTagIds, allTags]
  );
  const reorderable =
    layout === "list" && view.group === "sections" && view.sort.key === "manual";
  const calendarTasks = useMemo(() => {
    const seen = new Map<string, Task>();
    for (const g of display.groups) for (const t of g.tasks) seen.set(t.id, t);
    for (const list of display.kids.values()) for (const t of list) seen.set(t.id, t);
    return [...seen.values()];
  }, [display]);
  const filtersOn = activeFilterCount(view.filters) > 0;

  const sortedFields = useMemo(() => [...fields].sort(byPosition), [fields]);
  const visibleFields = sortedFields.filter((f) => f.visible);

  const visibleCols: { key: ColKey; label: string; width: number }[] = [
    ...BUILTINS.filter((k) => !cols.hidden.includes(k)).map((k) => ({
      key: k as ColKey,
      label: COLUMN_LABELS[k],
      width: cols.widths[k] ?? BUILTIN_WIDTH[k],
    })),
    ...visibleFields.map((f) => ({
      key: `f:${f.id}`,
      label: f.name,
      width: cols.widths[`f:${f.id}`] ?? f.width ?? FIELD_WIDTH[f.type],
    })),
  ];
  const nameWidth = cols.widths.name;
  const gridTemplate = [
    `${NUM_WIDTH}px`,
    nameWidth ? `${nameWidth}px` : `minmax(${NAME_FLEX_MIN}px, 1fr)`,
    ...visibleCols.map((c) => `${c.width}px`),
    `${ACTION_WIDTH}px`,
  ].join(" ");
  const tableMinWidth =
    NUM_WIDTH +
    (nameWidth ?? NAME_FLEX_MIN) +
    visibleCols.reduce((sum, c) => sum + c.width, 0) +
    ACTION_WIDTH;

  function toggleColumn(key: BuiltinKey) {
    setCols((c) => ({
      ...c,
      hidden: c.hidden.includes(key)
        ? c.hidden.filter((k) => k !== key)
        : [...c.hidden, key],
    }));
  }

  async function toggleFieldVisible(field: FieldDef) {
    setFields((prev) =>
      prev.map((f) => (f.id === field.id ? { ...f, visible: !f.visible } : f))
    );
    const { error } = await supabase
      .from("field_definitions")
      .update({ visible: !field.visible })
      .eq("id", field.id);
    if (error) {
      setError(error.message);
      load();
    }
  }

  function setWidth(key: ColKey, width: number) {
    const next = Math.round(Math.min(MAX_WIDTH, Math.max(minWidth(key), width)));
    setCols((c) => ({ ...c, widths: { ...c.widths, [key]: next } }));
  }

  function startResize(key: ColKey, e: React.PointerEvent<HTMLDivElement>) {
    const cell = e.currentTarget.parentElement;
    if (!cell) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizing.current = {
      key,
      startX: e.clientX,
      startWidth: cell.getBoundingClientRect().width,
    };
  }

  function moveResize(e: React.PointerEvent<HTMLDivElement>) {
    const r = resizing.current;
    if (!r) return;
    setWidth(r.key, r.startWidth + e.clientX - r.startX);
  }

  function endResize() {
    resizing.current = null;
  }

  function keyResize(key: ColKey, e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const cell = e.currentTarget.parentElement;
    if (!cell) return;
    const step = e.shiftKey ? 40 : 10;
    const current = cell.getBoundingClientRect().width;
    setWidth(key, current + (e.key === "ArrowRight" ? step : -step));
  }

  const isOwner = project?.created_by === meId;
  const assignableIds =
    project?.visibility === "private" && project.created_by
      ? [project.created_by]
      : undefined;

  const tagById = new Map(allTags.map((t) => [t.id, t]));
  function tagsOf(taskId: string): Tag[] {
    return (taskTagIds[taskId] ?? [])
      .map((id) => tagById.get(id))
      .filter((t): t is Tag => Boolean(t));
  }

  function rowProps(task: Task, depth: 0 | 1): Omit<RowProps, "handle"> {
    return {
      task,
      depth,
      rowNumber: display.numbering.get(task.id) ?? "",
      columns: {
        status: !cols.hidden.includes("status"),
        assignee: !cols.hidden.includes("assignee"),
        due: !cols.hidden.includes("due"),
        tags: !cols.hidden.includes("tags"),
      },
      fields: visibleFields,
      values: fieldValues[task.id] ?? {},
      tags: tagsOf(task.id),
      allTags,
      onField: (fieldId, value) => setFieldValue(task.id, fieldId, value),
      onToggleTag: (tagId) => toggleTag(task.id, tagId),
      onCreateTag: (name) => createTag(task.id, name),
      onManageTags: () => setEditingTags(true),
      statuses,
      profiles,
      assignableIds,
      done: Boolean(task.completed_at),
      hasChildren: depth === 0 && (display.kids.get(task.id)?.length ?? 0) > 0,
      collapsed: collapsedTasks.has(task.id),
      onToggleCollapse: () => toggleSet(setCollapsedTasks, task.id),
      onOpen: () => openTask(task.id),
      onStatus: (statusId) => setStatus(task, statusId),
      onAssignee: (assigneeId) => updateTask(task.id, { assignee_id: assigneeId }),
      onDue: (patch) => updateTask(task.id, patch),
      onToggleComplete: () => toggleComplete(task),
      onDelete: () => {
        void deleteTask(task).then((ok) => {
          if (ok && openTaskId === task.id) openTask(null);
        });
      },
      onAddSub:
        depth === 0
          ? () => {
              setCollapsedTasks((prev) => {
                const next = new Set(prev);
                next.delete(task.id);
                return next;
              });
              setAddingSubFor(task.id);
            }
          : undefined,
    };
  }

  if (loading) {
    return <p className="px-4 py-10 text-sm opacity-60">Loading...</p>;
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <h1 className="text-xl font-semibold">Project not found</h1>
        <p className="mt-2 text-sm opacity-70">
          It may have been deleted. Pick another project from the sidebar.
        </p>
        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
      </div>
    );
  }

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : undefined;
  const isEmpty = tasks.length === 0 && sections.length === 0;

  /* The owner always sees their project colors. The other person sees them
     only when the owner chose to share. */
  const savedColors = parseProjectColors(project.appearance);
  const shownColors =
    previewColors ??
    (isOwner || project.appearance_shared ? savedColors : {});
  const pageStyle = projectStyle(shownColors) as React.CSSProperties;

  return (
    <div className="min-h-screen" style={pageStyle}>
    <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6">
      <div className="flex items-center gap-2">
        {isOwner ? (
          <input
            key={project.name}
            defaultValue={project.name}
            aria-label="Project name"
            onBlur={(e) => {
              const value = e.target.value.trim();
              if (!value) e.target.value = project.name;
              else if (value !== project.name) renameProject(value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            className="min-w-0 flex-1 rounded bg-transparent px-1.5 py-1 text-2xl font-semibold tracking-tight outline-none focus:bg-current/5"
          />
        ) : (
          <h1 className="min-w-0 flex-1 truncate px-1.5 py-1 text-2xl font-semibold tracking-tight">
            {project.name}
          </h1>
        )}
        <Menu label="Project actions">
          <MenuItem onClick={() => setEditingStatuses(true)}>
            Edit statuses
          </MenuItem>
          <MenuItem onClick={() => setEditingFields(true)}>
            Add or edit columns
          </MenuItem>
          <MenuItem onClick={() => setEditingTags(true)}>Edit tags</MenuItem>
          {isOwner && (
            <MenuItem onClick={() => setEditingColors(true)}>
              Project colors
            </MenuItem>
          )}
          {isOwner && (
            <MenuItem
              onClick={() =>
                changeVisibility(
                  project.visibility === "private" ? "public" : "private"
                )
              }
            >
              {project.visibility === "private"
                ? "Share with everyone"
                : "Make private"}
            </MenuItem>
          )}
          {isOwner && (
            <MenuItem onClick={archiveProject}>Archive project</MenuItem>
          )}
        </Menu>
      </div>
      <p className="px-1.5 text-xs opacity-60">
        {project.visibility === "private"
          ? "Private. Only you can see this project."
          : isOwner
            ? "Shared. You and the other person can both edit tasks."
            : `Shared by ${profiles.find((p) => p.id === project.created_by)?.name ?? "the owner"}. You can edit tasks, but only they can rename or archive it.`}
      </p>

      {error && (
        <div
          role="alert"
          className="mt-3 flex items-start justify-between gap-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm"
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

      {editingStatuses && (
        <StatusEditor
          projectId={projectId}
          statuses={statuses}
          onClose={() => setEditingStatuses(false)}
          onChanged={load}
        />
      )}

      {editingFields && (
        <FieldsEditor
          projectId={projectId}
          fields={fields}
          onClose={() => setEditingFields(false)}
          onChanged={load}
        />
      )}

      {editingColors && isOwner && (
        <ProjectColorsEditor
          projectId={projectId}
          visibility={project.visibility}
          initial={savedColors}
          initialShared={Boolean(project.appearance_shared)}
          onPreview={setPreviewColors}
          onSaved={(colors, shared) =>
            setProject((p) =>
              p ? { ...p, appearance: colors, appearance_shared: shared } : p
            )
          }
          onClose={() => setEditingColors(false)}
        />
      )}

      {editingTags && (
        <TagsEditor
          tags={allTags}
          followedIds={followedTagIds}
          meId={meId}
          onClose={() => setEditingTags(false)}
          onChanged={load}
        />
      )}

      {isEmpty && (
        <p className="mt-4 text-sm opacity-60">
          This project is empty. Add your first task below, or add a section to
          group tasks.
        </p>
      )}

      <div
        role="radiogroup"
        aria-label="Layout"
        className="mt-4 inline-flex overflow-hidden rounded-md border border-current/20 text-sm"
      >
        {(
          [
            ["list", "List"],
            ["calendar", "Calendar"],
          ] as [Layout, string][]
        ).map(([value, text]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={layout === value}
            onClick={() => setLayout(value)}
            className={`px-4 py-1.5 ${
              layout === value ? "bg-accent/15 font-medium" : "hover:bg-current/10"
            }`}
          >
            {text}
          </button>
        ))}
      </div>

      <ViewToolbar
        hideLayout={layout === "calendar"}
        view={view}
        onChange={setView}
        meId={meId}
        profiles={profiles}
        statuses={statuses}
        tags={allTags}
        savedViews={savedViews}
        onSaveView={saveView}
        onDeleteView={deleteView}
        shown={display.shown}
        total={tasks.filter((t) => !t.parent_task_id).length}
      />

      {filtersOn && display.shown === 0 && (
        <p className="mt-4 text-sm opacity-70">
          No tasks match these filters.{" "}
          <button
            type="button"
            onClick={() => setView(DEFAULT_VIEW)}
            className="underline"
          >
            Reset view
          </button>
        </p>
      )}

      {layout === "calendar" && (
        <CalendarView
          tasks={calendarTasks}
          statuses={statuses}
          events={googleEvents}
          onRange={setEventRange}
          onOpenTask={(id) => openTask(id)}
          onReschedule={(task, patch) => updateTask(task.id, patch)}
        />
      )}

      {layout === "list" && (
      <div className="mt-4 overflow-x-auto">
        <div
          className="md:min-w-[var(--min)]"
          style={
            {
              "--cols": gridTemplate,
              "--min": `${tableMinWidth}px`,
            } as React.CSSProperties
          }
        >
          <div
            role="row"
            className="hidden border-y border-current/15 text-xs font-medium opacity-80 md:grid md:[grid-template-columns:var(--cols)]"
          >
            <div role="columnheader" className="px-3 py-2 text-right opacity-70">
              #
            </div>
            <HeaderCell label="Name" colKey="name" onStart={startResize} onMove={moveResize} onEnd={endResize} onKey={keyResize} />
            {visibleCols.map((c) => (
              <HeaderCell
                key={c.key}
                label={c.label}
                colKey={c.key}
                onStart={startResize}
                onMove={moveResize}
                onEnd={endResize}
                onKey={keyResize}
              />
            ))}
            <div
              role="columnheader"
              className="flex items-center justify-center border-l border-current/10"
            >
              <Menu
                label="Show or hide columns"
                trigger={<span className="text-lg">+</span>}
              >
                {BUILTINS.map((k) => (
                  <MenuItem key={k} onClick={() => toggleColumn(k)}>
                    {cols.hidden.includes(k) ? "Show " : "Hide "}
                    {COLUMN_LABELS[k]}
                  </MenuItem>
                ))}
                {sortedFields.map((f) => (
                  <MenuItem key={f.id} onClick={() => toggleFieldVisible(f)}>
                    {f.visible ? "Hide " : "Show "}
                    {f.name}
                  </MenuItem>
                ))}
                <MenuItem onClick={() => setEditingFields(true)}>
                  Add or edit columns
                </MenuItem>
                <MenuItem onClick={() => setEditingTags(true)}>Edit tags</MenuItem>
                <MenuItem
                  onClick={() =>
                    setCols((c) => ({ ...DEFAULT_COLS, hidden: c.hidden }))
                  }
                >
                  Reset column widths
                </MenuItem>
              </Menu>
            </div>
          </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        {display.groups.map((group) => {
          const section = group.section ?? null;
          const inSections = group.section !== undefined;
          const tops = group.tasks;
          const collapsible = Boolean(section) || !inSections;
          const collapsed = collapsible ? collapsedSections.has(group.id) : false;
          const sectionIndex = section
            ? sortedSections.findIndex((s) => s.id === section.id)
            : -1;

          const renderTask = (task: Task, sortable: boolean) => {
            const kids = display.kids.get(task.id) ?? [];
            const showKids = !collapsedTasks.has(task.id);
            const extra = (
              <>
                {showKids &&
                  kids.map((kid) => (
                    <TaskRow key={kid.id} {...rowProps(kid, 1)} />
                  ))}
                {addingSubFor === task.id && (
                  <AddInline
                    autoFocus
                    placeholder="Add a subtask"
                    className="pl-[4.5rem] md:pl-[9.5rem]"
                    onAdd={(name) => addTask(null, task.id, name)}
                    onCancel={() => setAddingSubFor(null)}
                  />
                )}
              </>
            );
            return sortable ? (
              <SortableTask key={task.id} {...rowProps(task, 0)}>
                {extra}
              </SortableTask>
            ) : (
              <div key={`${group.id}:${task.id}`}>
                <TaskRow {...rowProps(task, 0)} />
                {extra}
              </div>
            );
          };

          return (
            <section key={group.id} className="mt-6">
              <div className="flex items-center gap-1">
                {collapsible ? (
                  <button
                    type="button"
                    aria-label={collapsed ? "Expand group" : "Collapse group"}
                    aria-expanded={!collapsed}
                    onClick={() => toggleSet(setCollapsedSections, group.id)}
                    className="flex size-7 items-center justify-center rounded text-xs opacity-60 hover:bg-current/10 hover:opacity-100"
                  >
                    {collapsed ? "▸" : "▾"}
                  </button>
                ) : (
                  <span className="size-7" />
                )}
                {section ? (
                  <input
                    key={`${section.id}:${section.name}`}
                    defaultValue={section.name}
                    aria-label="Section name"
                    onBlur={(e) => {
                      const value = e.target.value.trim();
                      if (!value) e.target.value = section.name;
                      else if (value !== section.name)
                        renameSection(section.id, value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter")
                        (e.target as HTMLInputElement).blur();
                    }}
                    className="min-w-0 flex-1 rounded bg-transparent px-1.5 py-1 text-base font-semibold outline-none focus:bg-current/5"
                  />
                ) : (
                  <h2 className="flex-1 px-1.5 py-1 text-base font-semibold">
                    {group.label}
                  </h2>
                )}
                <span className="text-xs opacity-50">{tops.length}</span>
                {section && (
                  <Menu label="Section actions">
                    <MenuItem
                      onClick={() => moveSection(section.id, -1)}
                      disabled={sectionIndex <= 0}
                    >
                      Move up
                    </MenuItem>
                    <MenuItem
                      onClick={() => moveSection(section.id, 1)}
                      disabled={sectionIndex >= sortedSections.length - 1}
                    >
                      Move down
                    </MenuItem>
                    <MenuItem onClick={() => deleteSection(section)} danger>
                      Delete section
                    </MenuItem>
                  </Menu>
                )}
              </div>

              {!collapsed &&
                (reorderable ? (
                  <DropContainer id={group.id}>
                    <SortableContext
                      items={tops.map((t) => t.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {tops.map((task) => renderTask(task, true))}
                    </SortableContext>
                    <AddInline
                      placeholder="Add a task"
                      className="pl-[3.25rem] md:pl-[7.5rem]"
                      onAdd={(name) =>
                        addTask(section ? section.id : null, null, name)
                      }
                    />
                  </DropContainer>
                ) : (
                  <div className="min-h-10">
                    {tops.map((task) => renderTask(task, false))}
                    {inSections && (
                      <AddInline
                        placeholder="Add a task"
                        className="pl-[3.25rem] md:pl-[7.5rem]"
                        onAdd={(name) =>
                          addTask(section ? section.id : null, null, name)
                        }
                      />
                    )}
                  </div>
                ))}
            </section>
          );
        })}

        {view.group !== "sections" && (
          <AddInline
            placeholder="Add a task"
            className="mt-4 pl-[3.25rem] md:pl-[7.5rem]"
            onAdd={(name) => addTask(null, null, name)}
          />
        )}

        <DragOverlay>
          {activeTask ? (
            <div className="rounded-md border border-current/20 bg-background px-3 py-2 text-sm shadow-lg">
              {activeTask.name}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
        </div>
      </div>
      )}

      {openTaskId &&
        (() => {
          const open = tasks.find((t) => t.id === openTaskId);
          if (!open) return null;
          return (
            <TaskPanel
              key={open.id}
              task={open}
              parent={
                open.parent_task_id
                  ? (tasks.find((t) => t.id === open.parent_task_id) ?? null)
                  : null
              }
              subtasks={childrenOf.get(open.id) ?? []}
              meId={meId}
              statuses={statuses}
              profiles={profiles}
              assignableIds={assignableIds}
              columns={{
                status: !cols.hidden.includes("status"),
                assignee: !cols.hidden.includes("assignee"),
                due: !cols.hidden.includes("due"),
                tags: !cols.hidden.includes("tags"),
              }}
              fields={visibleFields}
              values={fieldValues[open.id] ?? {}}
              tags={tagsOf(open.id)}
              allTags={allTags}
              onField={(fieldId, value) => setFieldValue(open.id, fieldId, value)}
              onToggleTag={(tagId) => toggleTag(open.id, tagId)}
              onCreateTag={(name) => createTag(open.id, name)}
              onManageTags={() => setEditingTags(true)}
              onClose={() => openTask(null)}
              onOpenTask={(id) => openTask(id)}
              onUpdate={(id, patch) => updateTask(id, patch)}
              onStatus={(t, statusId) => setStatus(t, statusId)}
              onToggleComplete={(t) => toggleComplete(t)}
              onAddSubtask={(name) => addTask(null, open.id, name)}
              onDelete={async (t) => {
                if (await deleteTask(t)) openTask(null);
              }}
            />
          );
        })()}

      {layout === "list" && (
      <div className="mt-8 border-t border-current/10 pt-4">
        <AddInline
          placeholder="Add a section"
          onAdd={addSection}
          className="max-w-xs"
        />
      </div>
      )}
    </div>
    </div>
  );
}
