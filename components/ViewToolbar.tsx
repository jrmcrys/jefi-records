"use client";

import { useState } from "react";
import {
  COMPLETED_LABELS,
  DEFAULT_FILTERS,
  DEFAULT_VIEW,
  DUE_LABELS,
  GROUP_LABELS,
  SORT_LABELS,
  activeFilterCount,
  isDefaultView,
  sameView,
  type CompletedFilter,
  type CompletionFilter,
  type DueFilter,
  type GroupKey,
  type SortKey,
  type ViewConfig,
  type ViewFilters,
} from "@/lib/views";
import type { Profile, Status, Tag } from "@/lib/types";
import Popover from "./Popover";
import { FilterIcon, GroupIcon, OptionsIcon, SortIcon, ViewsIcon } from "./Icons";
import type { RowHeight } from "@/lib/tablePrefs";

export type SavedView = {
  id: string;
  name: string;
  created_by: string | null;
  view: ViewConfig;
};

const PRESETS: { name: string; view: ViewConfig }[] = [
  { name: "All tasks", view: DEFAULT_VIEW },
  {
    name: "My tasks",
    view: { ...DEFAULT_VIEW, filters: { ...DEFAULT_FILTERS, mine: true, completion: "incomplete" } },
  },
  {
    name: "Incomplete tasks",
    view: { ...DEFAULT_VIEW, filters: { ...DEFAULT_FILTERS, completion: "incomplete" } },
  },
  {
    name: "Completed tasks",
    view: {
      ...DEFAULT_VIEW,
      filters: { ...DEFAULT_FILTERS, completion: "completed" },
      sort: { key: "completed", dir: "desc" },
    },
  },
  {
    name: "Due this week",
    view: {
      ...DEFAULT_VIEW,
      filters: { ...DEFAULT_FILTERS, completion: "incomplete", due: "this_week" },
      sort: { key: "due", dir: "asc" },
    },
  },
];

const label = "mb-1 block text-xs font-medium uppercase tracking-wide opacity-60";
const control =
  "w-full rounded-md border border-current/20 bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-current/50";

function CheckRow({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-current/5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-accent"
      />
      <span className="min-w-0 truncate">{children}</span>
    </label>
  );
}

function toggle(list: string[], id: string, on: boolean): string[] {
  return on ? [...new Set([...list, id])] : list.filter((x) => x !== id);
}

function Badge({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="rounded-full bg-accent px-1.5 text-xs font-medium text-white">
      {n}
    </span>
  );
}

export default function ViewToolbar({
  view,
  onChange,
  meId,
  profiles,
  statuses,
  tags,
  savedViews,
  onSaveView,
  onDeleteView,
  shown,
  total,
  hideLayout,
  leading,
  rowHeight,
  onRowHeight,
  onResetColumns,
}: {
  view: ViewConfig;
  onChange: (view: ViewConfig) => void;
  meId: string;
  profiles: Profile[];
  statuses: Status[];
  tags: Tag[];
  savedViews: SavedView[];
  onSaveView: (name: string) => void | Promise<void>;
  onDeleteView: (id: string) => void | Promise<void>;
  shown: number;
  total: number;
  /** Hide sort and group, which only apply to the list. */
  hideLayout?: boolean;
  /** Shown at the left of the same row, such as the List and Calendar tabs. */
  leading?: React.ReactNode;
  rowHeight: RowHeight;
  onRowHeight: (h: RowHeight) => void;
  onResetColumns: () => void;
}) {
  const [saveName, setSaveName] = useState("");
  const f = view.filters;
  const count = activeFilterCount(f);
  const setFilters = (patch: Partial<ViewFilters>) =>
    onChange({ ...view, filters: { ...f, ...patch } });

  const currentName =
    [...PRESETS, ...savedViews.map((s) => ({ name: s.name, view: s.view }))].find(
      (v) => sameView(v.view, view)
    )?.name ?? null;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {leading}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
      <Popover
        label="Views"
        trigger={
          <>
            <ViewsIcon />
            <span className="max-md:sr-only">{currentName ?? "Custom view"}</span>
            <span aria-hidden="true" className="text-xs opacity-60 max-md:hidden">
              {"▾"}
            </span>
          </>
        }
        width={300}
      >
        {(close) => (
          <div className="space-y-3">
            <div>
              <span className={label}>Quick views</span>
              <ul>
                {PRESETS.map((p) => (
                  <li key={p.name}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(p.view);
                        close();
                      }}
                      className={`w-full rounded px-2 py-1.5 text-left hover:bg-current/10 ${
                        sameView(p.view, view) ? "bg-current/10 font-medium" : ""
                      }`}
                    >
                      {p.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            {savedViews.length > 0 && (
              <div>
                <span className={label}>Saved views</span>
                <ul>
                  {savedViews.map((s) => (
                    <li key={s.id} className="flex items-center">
                      <button
                        type="button"
                        onClick={() => {
                          onChange(s.view);
                          close();
                        }}
                        className={`min-w-0 flex-1 truncate rounded px-2 py-1.5 text-left hover:bg-current/10 ${
                          sameView(s.view, view) ? "bg-current/10 font-medium" : ""
                        }`}
                      >
                        {s.name}
                      </button>
                      {s.created_by === meId && (
                        <button
                          type="button"
                          aria-label={`Delete saved view ${s.name}`}
                          onClick={() => onDeleteView(s.id)}
                          className="flex size-7 shrink-0 items-center justify-center rounded text-base leading-none opacity-50 hover:bg-current/10 hover:opacity-100"
                        >
                          {"×"}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const name = saveName.trim();
                if (!name) return;
                void onSaveView(name);
                setSaveName("");
                close();
              }}
              className="border-t border-current/10 pt-3"
            >
              <span className={label}>Save the current view</span>
              <div className="flex gap-2">
                <input
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="Name this view"
                  aria-label="Saved view name"
                  className={`${control} flex-1 bg-transparent`}
                />
                <button
                  type="submit"
                  disabled={!saveName.trim()}
                  className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  Save
                </button>
              </div>
              <p className="mt-1 text-xs opacity-60">
                Saved views are shared with everyone who can see this project.
              </p>
            </form>
          </div>
        )}
      </Popover>

      <Popover
        label="Filter"
        trigger={
          <>
            <FilterIcon />
            <span className="max-md:sr-only">Filter</span>
            <Badge n={count} />
          </>
        }
        width={320}
      >
        {() => (
          <div className="space-y-4">
            <div>
              <label className={label} htmlFor="filter-search">
                Name contains
              </label>
              <input
                id="filter-search"
                value={f.search}
                onChange={(e) => setFilters({ search: e.target.value })}
                placeholder="Search tasks"
                className={`${control} bg-transparent`}
              />
            </div>

            <div>
              <span className={label}>Completion</span>
              <div role="radiogroup" aria-label="Completion" className="flex overflow-hidden rounded-md border border-current/20">
                {(
                  [
                    ["all", "All"],
                    ["incomplete", "Incomplete"],
                    ["completed", "Completed"],
                  ] as [CompletionFilter, string][]
                ).map(([value, text]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={f.completion === value}
                    onClick={() => setFilters({ completion: value })}
                    className={`flex-1 px-2 py-1.5 ${
                      f.completion === value ? "bg-accent/15 font-medium" : "hover:bg-current/10"
                    }`}
                  >
                    {text}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className={label}>Assignee</span>
              <CheckRow checked={f.mine} onChange={(on) => setFilters({ mine: on })}>
                Just my tasks
              </CheckRow>
              {profiles
                .filter((p) => p.id !== meId)
                .map((p) => (
                  <CheckRow
                    key={p.id}
                    checked={f.assignees.includes(p.id)}
                    onChange={(on) => setFilters({ assignees: toggle(f.assignees, p.id, on) })}
                  >
                    {p.name}
                  </CheckRow>
                ))}
              <CheckRow
                checked={f.assignees.includes("none")}
                onChange={(on) => setFilters({ assignees: toggle(f.assignees, "none", on) })}
              >
                Unassigned
              </CheckRow>
            </div>

            <div>
              <label className={label} htmlFor="filter-due">
                Due date
              </label>
              <select
                id="filter-due"
                value={f.due}
                onChange={(e) => setFilters({ due: e.target.value as DueFilter })}
                className={control}
              >
                {(Object.keys(DUE_LABELS) as DueFilter[]).map((k) => (
                  <option key={k} value={k}>
                    {DUE_LABELS[k]}
                  </option>
                ))}
              </select>
              {f.due === "custom" && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="date"
                    aria-label="Due from"
                    value={f.dueFrom ?? ""}
                    onChange={(e) => setFilters({ dueFrom: e.target.value || null })}
                    className={control}
                  />
                  <span className="opacity-60">to</span>
                  <input
                    type="date"
                    aria-label="Due until"
                    value={f.dueTo ?? ""}
                    onChange={(e) => setFilters({ dueTo: e.target.value || null })}
                    className={control}
                  />
                </div>
              )}
            </div>

            <div>
              <label className={label} htmlFor="filter-completed">
                Completed
              </label>
              <select
                id="filter-completed"
                value={f.completed}
                onChange={(e) => setFilters({ completed: e.target.value as CompletedFilter })}
                className={control}
              >
                {(Object.keys(COMPLETED_LABELS) as CompletedFilter[]).map((k) => (
                  <option key={k} value={k}>
                    {COMPLETED_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>

            {statuses.length > 0 && (
              <div>
                <span className={label}>Status</span>
                {statuses.map((s) => (
                  <CheckRow
                    key={s.id}
                    checked={f.statuses.includes(s.id)}
                    onChange={(on) => setFilters({ statuses: toggle(f.statuses, s.id, on) })}
                  >
                    {s.name}
                  </CheckRow>
                ))}
              </div>
            )}

            {tags.length > 0 && (
              <div>
                <span className={label}>Tags</span>
                {tags.map((t) => (
                  <CheckRow
                    key={t.id}
                    checked={f.tags.includes(t.id)}
                    onChange={(on) => setFilters({ tags: toggle(f.tags, t.id, on) })}
                  >
                    {t.name}
                  </CheckRow>
                ))}
              </div>
            )}

            <button
              type="button"
              disabled={count === 0}
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="text-sm underline disabled:opacity-30"
            >
              Clear filters
            </button>
          </div>
        )}
      </Popover>

      {!hideLayout && (
      <Popover
        label="Sort"
        trigger={
          <>
            <SortIcon />
            <span className="max-md:sr-only">Sort</span>
            {view.sort.key !== "manual" && (
              <span className="text-xs opacity-70 max-md:hidden">
                {SORT_LABELS[view.sort.key]}
              </span>
            )}
          </>
        }
        width={240}
      >
        {() => (
          <div className="space-y-3">
            <div role="radiogroup" aria-label="Sort by">
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={view.sort.key === k}
                  onClick={() => onChange({ ...view, sort: { ...view.sort, key: k } })}
                  className={`flex w-full items-center rounded px-2 py-1.5 text-left hover:bg-current/10 ${
                    view.sort.key === k ? "bg-current/10 font-medium" : ""
                  }`}
                >
                  {SORT_LABELS[k]}
                </button>
              ))}
            </div>
            <div
              role="radiogroup"
              aria-label="Direction"
              className="flex overflow-hidden rounded-md border border-current/20"
            >
              {(
                [
                  ["asc", "Ascending"],
                  ["desc", "Descending"],
                ] as const
              ).map(([dir, text]) => (
                <button
                  key={dir}
                  type="button"
                  role="radio"
                  aria-checked={view.sort.dir === dir}
                  disabled={view.sort.key === "manual"}
                  onClick={() => onChange({ ...view, sort: { ...view.sort, dir } })}
                  className={`flex-1 px-2 py-1.5 disabled:opacity-40 ${
                    view.sort.dir === dir ? "bg-accent/15 font-medium" : "hover:bg-current/10"
                  }`}
                >
                  {text}
                </button>
              ))}
            </div>
            {view.sort.key !== "manual" && (
              <p className="text-xs opacity-60">
                Dragging tasks to reorder is off while a sort is applied.
              </p>
            )}
          </div>
        )}
      </Popover>
      )}

      {!hideLayout && (
      <Popover
        label="Group"
        trigger={
          <>
            <GroupIcon />
            <span className="max-md:sr-only">Group</span>
            {view.group !== "sections" && (
              <span className="text-xs opacity-70 max-md:hidden">
                {GROUP_LABELS[view.group]}
              </span>
            )}
          </>
        }
        width={240}
      >
        {() => (
          <div role="radiogroup" aria-label="Group by">
            {(Object.keys(GROUP_LABELS) as GroupKey[]).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={view.group === k}
                onClick={() => onChange({ ...view, group: k })}
                className={`flex w-full items-center rounded px-2 py-1.5 text-left hover:bg-current/10 ${
                  view.group === k ? "bg-current/10 font-medium" : ""
                }`}
              >
                {GROUP_LABELS[k]}
              </button>
            ))}
            {view.group !== "sections" && (
              <p className="mt-2 text-xs opacity-60">
                Dragging tasks between groups is off while grouped this way.
              </p>
            )}
          </div>
        )}
      </Popover>
      )}

      {!hideLayout && (
        <Popover
          label="Options"
          trigger={
            <>
              <OptionsIcon />
              <span className="max-md:sr-only">Options</span>
            </>
          }
          width={240}
        >
          {(close) => (
            <div className="space-y-3">
              <div>
                <span className={label}>Row height</span>
                <div
                  role="radiogroup"
                  aria-label="Row height"
                  className="flex overflow-hidden rounded-md border border-current/20"
                >
                  {(
                    [
                      ["compact", "Compact"],
                      ["large", "Large"],
                    ] as [RowHeight, string][]
                  ).map(([value, text]) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={rowHeight === value}
                      onClick={() => onRowHeight(value)}
                      className={`flex-1 px-2 py-1.5 ${
                        rowHeight === value
                          ? "bg-accent/15 font-medium"
                          : "hover:bg-current/10"
                      }`}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onResetColumns();
                  close();
                }}
                className="text-sm underline"
              >
                Reset columns to Task and Due date
              </button>
              <p className="text-xs opacity-60">
                Column and row height choices are saved for you only.
              </p>
            </div>
          )}
        </Popover>
      )}

      {!isDefaultView(view) && (
        <button
          type="button"
          onClick={() => onChange(DEFAULT_VIEW)}
          className="text-sm underline opacity-70 hover:opacity-100"
        >
          Reset view
        </button>
      )}
      {count > 0 && (
        <span className="text-sm opacity-60" aria-live="polite">
          Showing {shown} of {total} tasks
        </span>
      )}
      </div>
    </div>
  );
}
