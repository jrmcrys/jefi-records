"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Menu, { MenuItem } from "./Menu";
import AssigneePicker from "./AssigneePicker";
import type { Profile, Status, Task } from "@/lib/types";

export type RowProps = {
  task: Task;
  depth: 0 | 1;
  statuses: Status[];
  profiles: Profile[];
  assignableIds?: string[];
  done: boolean;
  hasChildren: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onRename: (name: string) => void;
  onStatus: (statusId: string) => void;
  onAssignee: (assigneeId: string | null) => void;
  onToggleComplete: () => void;
  onDelete: () => void;
  onAddSub?: () => void;
  handle?: React.ReactNode;
};

export function TaskRow({
  task,
  depth,
  statuses,
  profiles,
  assignableIds,
  done,
  hasChildren,
  collapsed,
  onToggleCollapse,
  onRename,
  onStatus,
  onAssignee,
  onToggleComplete,
  onDelete,
  onAddSub,
  handle,
}: RowProps) {
  const status = statuses.find((s) => s.id === task.status_id);

  return (
    <div
      className="flex flex-wrap items-center gap-x-1 gap-y-1 border-b border-current/10 py-1.5"
      style={{ paddingLeft: depth * 28 }}
    >
      <div className="flex size-6 shrink-0 items-center justify-center">
        {handle}
      </div>

      <div className="flex size-6 shrink-0 items-center justify-center">
        {hasChildren && (
          <button
            type="button"
            aria-label={collapsed ? "Show subtasks" : "Hide subtasks"}
            aria-expanded={!collapsed}
            onClick={onToggleCollapse}
            className="flex size-6 items-center justify-center rounded text-xs opacity-60 hover:bg-current/10 hover:opacity-100"
          >
            {collapsed ? "▸" : "▾"}
          </button>
        )}
      </div>

      <input
        type="checkbox"
        checked={done}
        onChange={onToggleComplete}
        aria-label={done ? "Mark as not done" : "Mark as done"}
        className="mx-1 size-4 shrink-0 accent-current"
      />

      <input
        key={`${task.id}:${task.name}`}
        defaultValue={task.name}
        aria-label="Task name"
        onBlur={(e) => {
          const value = e.target.value.trim();
          if (!value) {
            e.target.value = task.name;
          } else if (value !== task.name) {
            onRename(value);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className={`min-w-0 flex-1 basis-40 rounded px-1.5 py-1.5 text-sm outline-none focus:bg-current/5 ${
          done ? "line-through opacity-50" : ""
        } bg-transparent`}
      />

      <div className="order-last flex w-full items-center gap-2 pl-[3.25rem] md:order-none md:w-auto md:pl-0">
        <label className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: status?.color ?? "#71717a" }}
          />
          <select
            value={task.status_id ?? ""}
            onChange={(e) => onStatus(e.target.value)}
            aria-label="Status"
            className="rounded-md border border-current/20 bg-background px-1.5 py-1 text-xs"
          >
            {task.status_id === null && <option value="">No status</option>}
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <AssigneePicker
          profiles={profiles}
          assignableIds={assignableIds}
          value={task.assignee_id}
          onChange={onAssignee}
        />
      </div>

      <Menu>
        {onAddSub && depth === 0 && (
          <MenuItem onClick={onAddSub}>Add subtask</MenuItem>
        )}
        <MenuItem onClick={onDelete} danger>
          Delete task
        </MenuItem>
      </Menu>
    </div>
  );
}

export function SortableTask({
  children,
  ...rowProps
}: Omit<RowProps, "handle"> & { children?: React.ReactNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: rowProps.task.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      <TaskRow
        {...rowProps}
        handle={
          <button
            type="button"
            aria-label="Drag to reorder"
            {...attributes}
            {...listeners}
            className="flex size-6 cursor-grab touch-none items-center justify-center rounded text-xs opacity-40 hover:bg-current/10 hover:opacity-100 active:cursor-grabbing"
          >
            {"⋮⋮"}
          </button>
        }
      />
      {children}
    </div>
  );
}
