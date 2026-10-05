"use client";

import { useState } from "react";
import Popover from "./Popover";
import type { Profile, Section, Status, Tag } from "@/lib/types";

const barButton =
  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm hover:bg-current/10";

const listItem =
  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-current/10";

/* The bar that appears at the bottom of the screen while tasks are selected.
   Every action applies to all selected tasks at once. */
export default function BulkBar({
  count,
  topLevelCount,
  statuses,
  profiles,
  assignableIds,
  tags,
  sections,
  defaultSectionName,
  allDone,
  onStatus,
  onAssignee,
  onDue,
  onAddTag,
  onRemoveTag,
  onMove,
  onComplete,
  onDelete,
  onClear,
}: {
  count: number;
  /** How many of the selected tasks are not subtasks (only those can move). */
  topLevelCount: number;
  statuses: Status[];
  profiles: Profile[];
  assignableIds?: string[];
  tags: Tag[];
  sections: Section[];
  defaultSectionName: string;
  allDone: boolean;
  onStatus: (statusId: string) => void;
  onAssignee: (id: string | null) => void;
  onDue: (date: string | null) => void;
  onAddTag: (tagId: string) => void;
  onRemoveTag: (tagId: string) => void;
  onMove: (sectionId: string | null) => void;
  onComplete: (done: boolean) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const [date, setDate] = useState("");
  const [tagMode, setTagMode] = useState<"add" | "remove">("add");
  const people = assignableIds
    ? profiles.filter((p) => assignableIds.includes(p.id))
    : profiles;

  return (
    <div
      role="toolbar"
      aria-label="Actions for selected tasks"
      className="fixed bottom-4 left-1/2 z-[60] flex max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-0.5 rounded-xl border border-current/20 bg-background px-2 py-1.5 text-sm shadow-xl"
    >
      <span className="px-2 font-medium tabular-nums">
        {count} selected
      </span>

      <Popover label="Set status" buttonClassName={barButton} trigger="Status" width={220}>
        {(close) => (
          <div>
            {statuses.map((s) => (
              <button
                key={s.id}
                type="button"
                className={listItem}
                onClick={() => {
                  onStatus(s.id);
                  close();
                }}
              >
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                {s.name}
              </button>
            ))}
          </div>
        )}
      </Popover>

      <Popover label="Set assignee" buttonClassName={barButton} trigger="Assignee" width={220}>
        {(close) => (
          <div>
            {people.map((p) => (
              <button
                key={p.id}
                type="button"
                className={listItem}
                onClick={() => {
                  onAssignee(p.id);
                  close();
                }}
              >
                {p.name}
              </button>
            ))}
            <button
              type="button"
              className={`${listItem} opacity-70`}
              onClick={() => {
                onAssignee(null);
                close();
              }}
            >
              Unassigned
            </button>
          </div>
        )}
      </Popover>

      <Popover label="Set due date" buttonClassName={barButton} trigger="Due date" width={240}>
        {(close) => (
          <div className="space-y-2">
            <input
              type="date"
              aria-label="Due date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-md border border-current/20 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-current/50"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!date}
                onClick={() => {
                  onDue(date);
                  close();
                }}
                className="flex-1 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={() => {
                  onDue(null);
                  close();
                }}
                className="rounded-md border border-current/20 px-3 py-1.5 text-sm hover:bg-current/10"
              >
                Clear date
              </button>
            </div>
          </div>
        )}
      </Popover>

      <Popover label="Change tags" buttonClassName={barButton} trigger="Tags" width={240}>
        {() => (
          <div className="space-y-2">
            <div
              role="radiogroup"
              aria-label="Tag action"
              className="flex overflow-hidden rounded-md border border-current/20"
            >
              {(
                [
                  ["add", "Add tag"],
                  ["remove", "Remove tag"],
                ] as const
              ).map(([value, text]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={tagMode === value}
                  onClick={() => setTagMode(value)}
                  className={`flex-1 px-2 py-1.5 ${
                    tagMode === value ? "bg-accent/15 font-medium" : "hover:bg-current/10"
                  }`}
                >
                  {text}
                </button>
              ))}
            </div>
            {tags.length === 0 && (
              <p className="px-1 text-xs opacity-60">
                No tags yet. Add one from any task first.
              </p>
            )}
            {tags.map((t) => (
              <button
                key={t.id}
                type="button"
                className={listItem}
                onClick={() =>
                  tagMode === "add" ? onAddTag(t.id) : onRemoveTag(t.id)
                }
              >
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: t.color }}
                />
                {t.name}
              </button>
            ))}
          </div>
        )}
      </Popover>

      {topLevelCount > 0 && (
        <Popover label="Move to section" buttonClassName={barButton} trigger="Move" width={240}>
          {(close) => (
            <div>
              <button
                type="button"
                className={listItem}
                onClick={() => {
                  onMove(null);
                  close();
                }}
              >
                {defaultSectionName}
              </button>
              {sections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={listItem}
                  onClick={() => {
                    onMove(s.id);
                    close();
                  }}
                >
                  {s.name}
                </button>
              ))}
              {topLevelCount < count && (
                <p className="px-2 pt-2 text-xs opacity-60">
                  Subtasks stay with their parent task.
                </p>
              )}
            </div>
          )}
        </Popover>
      )}

      <button
        type="button"
        className={barButton}
        onClick={() => onComplete(!allDone)}
      >
        {allDone ? "Reopen" : "Complete"}
      </button>

      <button
        type="button"
        className={`${barButton} text-red-500`}
        onClick={onDelete}
      >
        Delete
      </button>

      <button
        type="button"
        aria-label="Clear selection"
        title="Clear selection"
        className="flex size-8 items-center justify-center rounded-md text-lg leading-none opacity-70 hover:bg-current/10 hover:opacity-100"
        onClick={onClear}
      >
        {"×"}
      </button>
    </div>
  );
}
