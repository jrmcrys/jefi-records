"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Menu, { MenuItem } from "./Menu";
import AssigneePicker from "./AssigneePicker";
import DueDate, { type DuePatch } from "./DueDate";
import ChipPicker from "./ChipPicker";
import FieldCell from "./FieldCell";
import type { FieldDef, FieldValues, Profile, Status, Tag, Task } from "@/lib/types";

export type ColumnVisibility = {
  status: boolean;
  assignee: boolean;
  due: boolean;
  tags: boolean;
};

export type RowProps = {
  task: Task;
  depth: 0 | 1;
  rowNumber: string;
  columns: ColumnVisibility;
  fields: FieldDef[];
  values: FieldValues;
  tags: Tag[];
  allTags: Tag[];
  onField: (fieldId: string, value: unknown) => void;
  onToggleTag: (tagId: string) => void;
  onCreateTag: (name: string) => void | Promise<void>;
  onManageTags: () => void;
  statuses: Status[];
  profiles: Profile[];
  assignableIds?: string[];
  done: boolean;
  hasChildren: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpen: () => void;
  onStatus: (statusId: string) => void;
  onAssignee: (assigneeId: string | null) => void;
  onDue: (patch: DuePatch) => void;
  onToggleComplete: () => void;
  onDelete: () => void;
  onAddSub?: () => void;
  handle?: React.ReactNode;
};

const cell = "md:flex md:items-center md:self-stretch md:border-l md:border-current/10 md:px-2";

export function TaskRow({
  task,
  depth,
  rowNumber,
  columns,
  fields,
  values,
  tags,
  allTags,
  onField,
  onToggleTag,
  onCreateTag,
  onManageTags,
  statuses,
  profiles,
  assignableIds,
  done,
  hasChildren,
  collapsed,
  onToggleCollapse,
  onOpen,
  onStatus,
  onAssignee,
  onDue,
  onToggleComplete,
  onDelete,
  onAddSub,
  handle,
}: RowProps) {
  const status = statuses.find((s) => s.id === task.status_id);

  return (
    <div className="group flex flex-wrap items-center border-b border-current/10 md:grid md:min-h-11 md:flex-nowrap md:[grid-template-columns:var(--cols)]">
      <div className="flex shrink-0 items-center md:pl-1">
        <div className="flex size-7 items-center justify-center md:[@media(hover:hover)]:opacity-0 md:transition-opacity md:focus-within:opacity-100 md:group-hover:opacity-100">
          {handle}
        </div>
        <span className="hidden w-8 text-right text-xs tabular-nums opacity-50 md:block">
          {rowNumber}
        </span>
      </div>

      <div
        className="flex min-w-0 flex-1 items-center md:flex-none md:self-stretch md:border-l md:border-current/10"
        style={{ paddingLeft: depth * 24 }}
      >
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
          className="mx-1.5 size-4 shrink-0 accent-accent"
        />

        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open task: ${task.name}`}
          title="Open task"
          className={`min-w-0 flex-1 truncate rounded px-1.5 py-2 text-left text-sm hover:bg-current/5 hover:underline ${
            done ? "line-through opacity-50" : ""
          }`}
        >
          {task.name}
        </button>
      </div>

      <div className="order-last flex w-full flex-wrap items-center gap-2 pb-2 pl-10 md:contents">
        {columns.status && (
          <div className={cell}>
            <div className="relative w-full min-w-28">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 size-2.5 -translate-y-1/2 rounded-full"
                style={{ backgroundColor: status?.color ?? "#71717a" }}
              />
              <select
                value={task.status_id ?? ""}
                onChange={(e) => onStatus(e.target.value)}
                aria-label="Status"
                className="w-full appearance-none truncate rounded-md border border-current/20 bg-background py-1.5 pl-7 pr-8 text-sm text-foreground md:border-transparent md:hover:border-current/20"
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
          <div className={cell}>
            <AssigneePicker
              profiles={profiles}
              assignableIds={assignableIds}
              value={task.assignee_id}
              onChange={onAssignee}
            />
          </div>
        )}

        {columns.due && (
          <div className={`${cell} min-w-24`}>
            <DueDate
              value={task.due_at}
              hasTime={task.due_has_time}
              recurrence={task.recurrence}
              done={done}
              onChange={onDue}
            />
          </div>
        )}

        {columns.tags && (
          <div className={cell}>
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
        )}

        {fields.map((f) => (
          <div key={f.id} className={cell}>
            <FieldCell
              field={f}
              value={values[f.id]}
              profiles={profiles}
              assignableIds={assignableIds}
              onChange={(v) => onField(f.id, v)}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center md:self-stretch md:border-l md:border-current/10">
        <Menu>
          <MenuItem onClick={onOpen}>Open task</MenuItem>
          {onAddSub && depth === 0 && (
            <MenuItem onClick={onAddSub}>Add subtask</MenuItem>
          )}
          <MenuItem onClick={onDelete} danger>
            Delete task
          </MenuItem>
        </Menu>
      </div>
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
            className="flex size-6 cursor-grab touch-none items-center justify-center rounded text-xs opacity-60 hover:bg-current/10 hover:opacity-100 active:cursor-grabbing"
          >
            {"⋮⋮"}
          </button>
        }
      />
      {children}
    </div>
  );
}
