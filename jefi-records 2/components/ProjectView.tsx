"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  PROFILE_COLUMNS,
  PROJECT_COLUMNS,
  TASK_COLUMNS,
  type Profile,
  type Project,
  type Section,
  type Status,
  type Task,
  type Visibility,
} from "@/lib/types";
import AddInline from "./AddInline";
import Menu, { MenuItem } from "./Menu";
import StatusEditor from "./StatusEditor";
import { SortableTask, TaskRow, type RowProps } from "./TaskRow";

const byPosition = (a: { position: number; created_at?: string }, b: { position: number; created_at?: string }) =>
  a.position - b.position ||
  (a.created_at ?? "").localeCompare(b.created_at ?? "");

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
    const [p, s, st, t, pr] = await Promise.all([
      supabase
        .from("projects")
        .select(PROJECT_COLUMNS)
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
    ]);
    const err = p.error ?? s.error ?? st.error ?? t.error ?? pr.error;
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
    setLoading(false);
  }, [supabase, projectId]);

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

  async function deleteTask(task: Task) {
    const count = childrenOf.get(task.id)?.length ?? 0;
    const message = count
      ? `Delete "${task.name}" and its ${count} subtask${count === 1 ? "" : "s"}?`
      : `Delete "${task.name}"?`;
    if (!window.confirm(message)) return;
    setTasks((prev) =>
      prev.filter((t) => t.id !== task.id && t.parent_task_id !== task.id)
    );
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    if (error) {
      setError(error.message);
      load();
    }
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

  const isOwner = project?.created_by === meId;
  const assignableIds =
    project?.visibility === "private" && project.created_by
      ? [project.created_by]
      : undefined;

  function rowProps(task: Task, depth: 0 | 1): Omit<RowProps, "handle"> {
    return {
      task,
      depth,
      statuses,
      profiles,
      assignableIds,
      done: Boolean(task.completed_at),
      hasChildren: depth === 0 && (childrenOf.get(task.id)?.length ?? 0) > 0,
      collapsed: collapsedTasks.has(task.id),
      onToggleCollapse: () => toggleSet(setCollapsedTasks, task.id),
      onRename: (name) => updateTask(task.id, { name }),
      onStatus: (statusId) => setStatus(task, statusId),
      onAssignee: (assigneeId) => updateTask(task.id, { assignee_id: assigneeId }),
      onToggleComplete: () => toggleComplete(task),
      onDelete: () => deleteTask(task),
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

  const containers: { id: string; section: Section | null }[] = [
    { id: "none", section: null },
    ...sortedSections.map((s) => ({ id: s.id, section: s })),
  ];
  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : undefined;
  const isEmpty = tasks.length === 0 && sections.length === 0;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
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

      {isEmpty && (
        <p className="mt-4 text-sm opacity-60">
          This project is empty. Add your first task below, or add a section to
          group tasks.
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        {containers.map(({ id, section }) => {
          const tops = topBySection.get(id) ?? [];
          const collapsed = section ? collapsedSections.has(section.id) : false;
          const sectionIndex = section
            ? sortedSections.findIndex((s) => s.id === section.id)
            : -1;

          return (
            <section key={id} className="mt-6">
              <div className="flex items-center gap-1">
                {section ? (
                  <button
                    type="button"
                    aria-label={collapsed ? "Expand section" : "Collapse section"}
                    aria-expanded={!collapsed}
                    onClick={() => toggleSet(setCollapsedSections, section.id)}
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
                    Tasks
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

              {!collapsed && (
                <DropContainer id={id}>
                  <SortableContext
                    items={tops.map((t) => t.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {tops.map((task) => {
                      const kids = childrenOf.get(task.id) ?? [];
                      const showKids = !collapsedTasks.has(task.id);
                      return (
                        <SortableTask key={task.id} {...rowProps(task, 0)}>
                          {showKids &&
                            kids.map((kid) => (
                              <TaskRow key={kid.id} {...rowProps(kid, 1)} />
                            ))}
                          {addingSubFor === task.id && (
                            <AddInline
                              autoFocus
                              placeholder="Add a subtask"
                              className="pl-[4.5rem]"
                              onAdd={(name) => addTask(null, task.id, name)}
                              onCancel={() => setAddingSubFor(null)}
                            />
                          )}
                        </SortableTask>
                      );
                    })}
                  </SortableContext>
                  <AddInline
                    placeholder="Add a task"
                    className="pl-[3.25rem]"
                    onAdd={(name) => addTask(section ? section.id : null, null, name)}
                  />
                </DropContainer>
              )}
            </section>
          );
        })}

        <DragOverlay>
          {activeTask ? (
            <div className="rounded-md border border-current/20 bg-background px-3 py-2 text-sm shadow-lg">
              {activeTask.name}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <div className="mt-8 border-t border-current/10 pt-4">
        <AddInline
          placeholder="Add a section"
          onAdd={addSection}
          className="max-w-xs"
        />
      </div>
    </div>
  );
}
