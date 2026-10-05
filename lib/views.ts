import type { Profile, Section, Status, Task } from "./types";

/* Filters, sorting and grouping for a project's task list. Everything here is
   plain functions over the tasks already loaded in the browser. Weeks run
   Monday to Sunday. */

export type CompletionFilter = "all" | "incomplete" | "completed";
export type DueFilter =
  | "any"
  | "overdue"
  | "today"
  | "tomorrow"
  | "this_week"
  | "next_week"
  | "this_month"
  | "none"
  | "custom";
export type CompletedFilter = "any" | "today" | "last_7" | "last_30";

export type ViewFilters = {
  completion: CompletionFilter;
  mine: boolean;
  /** Profile ids, or "none" for unassigned. Empty means everyone. */
  assignees: string[];
  statuses: string[];
  tags: string[];
  due: DueFilter;
  dueFrom: string | null;
  dueTo: string | null;
  completed: CompletedFilter;
  search: string;
};

export type SortKey =
  | "manual"
  | "name"
  | "due"
  | "created"
  | "completed"
  | "status"
  | "assignee";

export type SortRule = { key: SortKey; dir: "asc" | "desc" };

export type GroupKey =
  | "sections"
  | "due"
  | "assignee"
  | "status"
  | "created"
  | "completed"
  | "tag";

export type ViewConfig = {
  filters: ViewFilters;
  sort: SortRule;
  group: GroupKey;
};

export const DEFAULT_FILTERS: ViewFilters = {
  completion: "all",
  mine: false,
  assignees: [],
  statuses: [],
  tags: [],
  due: "any",
  dueFrom: null,
  dueTo: null,
  completed: "any",
  search: "",
};

export const DEFAULT_VIEW: ViewConfig = {
  filters: DEFAULT_FILTERS,
  sort: { key: "manual", dir: "asc" },
  group: "sections",
};

export const SORT_LABELS: Record<SortKey, string> = {
  manual: "Manual order",
  name: "Name",
  due: "Due date",
  created: "Created on",
  completed: "Completed on",
  status: "Status",
  assignee: "Assignee",
};

export const GROUP_LABELS: Record<GroupKey, string> = {
  sections: "Sections",
  due: "Due date",
  assignee: "Assignee",
  status: "Status",
  created: "Created on",
  completed: "Completed on",
  tag: "Tag",
};

export const DUE_LABELS: Record<DueFilter, string> = {
  any: "Any time",
  overdue: "Overdue",
  today: "Today",
  tomorrow: "Tomorrow",
  this_week: "This week",
  next_week: "Next week",
  this_month: "This month",
  none: "No due date",
  custom: "Custom range",
};

export const COMPLETED_LABELS: Record<CompletedFilter, string> = {
  any: "Any time",
  today: "Today",
  last_7: "Last 7 days",
  last_30: "Last 30 days",
};

export type ViewContext = {
  meId: string;
  statuses: Status[];
  profiles: Profile[];
  tagIdsOf: (taskId: string) => string[];
  now?: Date;
};

/* parsing, so that old or hand-edited saved data never breaks the page */

const COMPLETION: CompletionFilter[] = ["all", "incomplete", "completed"];
const DUE: DueFilter[] = [
  "any", "overdue", "today", "tomorrow", "this_week", "next_week",
  "this_month", "none", "custom",
];
const COMPLETED: CompletedFilter[] = ["any", "today", "last_7", "last_30"];
const SORTS = Object.keys(SORT_LABELS) as SortKey[];
const GROUPS = Object.keys(GROUP_LABELS) as GroupKey[];

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function dateOrNull(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export function parseFilters(value: unknown): ViewFilters {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_FILTERS;
  }
  const v = value as Record<string, unknown>;
  return {
    completion: COMPLETION.includes(v.completion as CompletionFilter)
      ? (v.completion as CompletionFilter)
      : "all",
    mine: v.mine === true,
    assignees: strings(v.assignees),
    statuses: strings(v.statuses),
    tags: strings(v.tags),
    due: DUE.includes(v.due as DueFilter) ? (v.due as DueFilter) : "any",
    dueFrom: dateOrNull(v.dueFrom),
    dueTo: dateOrNull(v.dueTo),
    completed: COMPLETED.includes(v.completed as CompletedFilter)
      ? (v.completed as CompletedFilter)
      : "any",
    search: typeof v.search === "string" ? v.search : "",
  };
}

export function parseSort(value: unknown): SortRule {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_VIEW.sort;
  }
  const v = value as Record<string, unknown>;
  return {
    key: SORTS.includes(v.key as SortKey) ? (v.key as SortKey) : "manual",
    dir: v.dir === "desc" ? "desc" : "asc",
  };
}

export function parseGroup(value: unknown): GroupKey {
  return GROUPS.includes(value as GroupKey) ? (value as GroupKey) : "sections";
}

export function parseView(value: unknown): ViewConfig {
  if (!value || typeof value !== "object") return DEFAULT_VIEW;
  const v = value as Record<string, unknown>;
  return {
    filters: parseFilters(v.filters),
    sort: parseSort(v.sort),
    group: parseGroup(v.group),
  };
}

export function sameView(a: ViewConfig, b: ViewConfig): boolean {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

function normalize(v: ViewConfig) {
  const f = v.filters;
  return {
    f: {
      ...f,
      assignees: [...f.assignees].sort(),
      statuses: [...f.statuses].sort(),
      tags: [...f.tags].sort(),
      search: f.search.trim().toLowerCase(),
      dueFrom: f.due === "custom" ? f.dueFrom : null,
      dueTo: f.due === "custom" ? f.dueTo : null,
    },
    s: v.sort.key === "manual" ? { key: "manual", dir: "asc" } : v.sort,
    g: v.group,
  };
}

export function isDefaultView(v: ViewConfig): boolean {
  return sameView(v, DEFAULT_VIEW);
}

export function activeFilterCount(f: ViewFilters): number {
  let n = 0;
  if (f.completion !== "all") n += 1;
  if (f.mine) n += 1;
  if (f.assignees.length) n += 1;
  if (f.statuses.length) n += 1;
  if (f.tags.length) n += 1;
  if (f.due !== "any") n += 1;
  if (f.completed !== "any") n += 1;
  if (f.search.trim()) n += 1;
  return n;
}

/* dates */

const DAY = 86400000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfWeek(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
}

function dayNumber(d: Date): number {
  return Math.round(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY
  );
}

function localDateKey(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* filtering */

export function matchesFilters(
  task: Task,
  f: ViewFilters,
  ctx: ViewContext
): boolean {
  const now = ctx.now ?? new Date();
  const done = Boolean(task.completed_at);

  if (f.completion === "incomplete" && done) return false;
  if (f.completion === "completed" && !done) return false;
  if (f.mine && task.assignee_id !== ctx.meId) return false;
  if (f.assignees.length && !f.assignees.includes(task.assignee_id ?? "none")) {
    return false;
  }
  if (f.statuses.length && !(task.status_id && f.statuses.includes(task.status_id))) {
    return false;
  }
  if (f.tags.length) {
    const own = ctx.tagIdsOf(task.id);
    if (!f.tags.some((t) => own.includes(t))) return false;
  }
  const q = f.search.trim().toLowerCase();
  if (q && !task.name.toLowerCase().includes(q)) return false;

  if (f.due !== "any") {
    if (f.due === "none") {
      if (task.due_at) return false;
    } else {
      if (!task.due_at) return false;
      const key = localDateKey(task.due_at);
      const due = startOfDay(new Date(task.due_at));
      const diff = dayNumber(due) - dayNumber(now);
      const weekStart = startOfWeek(now);
      const weekDiff = Math.floor((dayNumber(due) - dayNumber(weekStart)) / 7);
      switch (f.due) {
        case "overdue":
          if (!(diff < 0 && !done)) return false;
          break;
        case "today":
          if (diff !== 0) return false;
          break;
        case "tomorrow":
          if (diff !== 1) return false;
          break;
        case "this_week":
          if (weekDiff !== 0) return false;
          break;
        case "next_week":
          if (weekDiff !== 1) return false;
          break;
        case "this_month":
          if (
            due.getFullYear() !== now.getFullYear() ||
            due.getMonth() !== now.getMonth()
          )
            return false;
          break;
        case "custom":
          if (f.dueFrom && key < f.dueFrom) return false;
          if (f.dueTo && key > f.dueTo) return false;
          break;
      }
    }
  }

  if (f.completed !== "any") {
    if (!task.completed_at) return false;
    const days = dayNumber(now) - dayNumber(startOfDay(new Date(task.completed_at)));
    const limit = f.completed === "today" ? 0 : f.completed === "last_7" ? 6 : 29;
    if (days < 0 || days > limit) return false;
  }

  return true;
}

/* sorting */

function cmpText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

function cmpNullable<T>(
  a: T | null | undefined,
  b: T | null | undefined,
  cmp: (x: T, y: T) => number,
  dir: 1 | -1
): number {
  const an = a === null || a === undefined;
  const bn = b === null || b === undefined;
  if (an && bn) return 0;
  if (an) return 1;
  if (bn) return -1;
  return cmp(a as T, b as T) * dir;
}

export function sortTasks(
  tasks: Task[],
  rule: SortRule,
  ctx: ViewContext
): Task[] {
  const dir = rule.dir === "desc" ? -1 : 1;
  const statusPos = new Map(ctx.statuses.map((s) => [s.id, s.position]));
  const nameOf = new Map(ctx.profiles.map((p) => [p.id, p.name]));
  const byIso = (x: string, y: string) => new Date(x).getTime() - new Date(y).getTime();
  const manual = (a: Task, b: Task) =>
    a.position - b.position || a.created_at.localeCompare(b.created_at);

  return [...tasks].sort((a, b) => {
    let c = 0;
    switch (rule.key) {
      case "manual":
        return manual(a, b);
      case "name":
        c = cmpText(a.name, b.name) * dir;
        break;
      case "due":
        c = cmpNullable(a.due_at, b.due_at, byIso, dir);
        break;
      case "created":
        c = byIso(a.created_at, b.created_at) * dir;
        break;
      case "completed":
        c = cmpNullable(a.completed_at, b.completed_at, byIso, dir);
        break;
      case "status":
        c = cmpNullable(
          a.status_id ? statusPos.get(a.status_id) : null,
          b.status_id ? statusPos.get(b.status_id) : null,
          (x, y) => x - y,
          dir
        );
        break;
      case "assignee":
        c = cmpNullable(
          a.assignee_id ? (nameOf.get(a.assignee_id) ?? "") : null,
          b.assignee_id ? (nameOf.get(b.assignee_id) ?? "") : null,
          cmpText,
          dir
        );
        break;
    }
    return c || manual(a, b);
  });
}

/* grouping */

export type DisplayGroup = {
  id: string;
  label: string;
  /** Set only when grouping by sections: the section these tasks live in. */
  section?: Section | null;
  tasks: Task[];
};

const DUE_BUCKETS: [string, string][] = [
  ["overdue", "Overdue"],
  ["today", "Today"],
  ["tomorrow", "Tomorrow"],
  ["this_week", "Later this week"],
  ["next_week", "Next week"],
  ["later", "Later"],
  ["earlier", "Earlier"],
  ["none", "No due date"],
];

function dueBucket(task: Task, now: Date): string {
  if (!task.due_at) return "none";
  const due = startOfDay(new Date(task.due_at));
  const diff = dayNumber(due) - dayNumber(now);
  if (diff < 0) return task.completed_at ? "earlier" : "overdue";
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  const weekDiff = Math.floor(
    (dayNumber(due) - dayNumber(startOfWeek(now))) / 7
  );
  if (weekDiff === 0) return "this_week";
  if (weekDiff === 1) return "next_week";
  return "later";
}

const PAST_BUCKETS: [string, string][] = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["this_week", "Earlier this week"],
  ["last_week", "Last week"],
  ["this_month", "Earlier this month"],
  ["older", "Older"],
];

function pastBucket(iso: string, now: Date): string {
  const d = startOfDay(new Date(iso));
  const diff = dayNumber(now) - dayNumber(d);
  if (diff <= 0) return "today";
  if (diff === 1) return "yesterday";
  const gap = dayNumber(startOfWeek(now)) - dayNumber(d);
  if (gap <= 0) return "this_week";
  if (gap <= 7) return "last_week";
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
    return "this_month";
  }
  return "older";
}

function bucketGroups(
  tasks: Task[],
  buckets: [string, string][],
  keyOf: (t: Task) => string,
  prefix: string
): DisplayGroup[] {
  const map = new Map<string, Task[]>();
  for (const t of tasks) {
    const k = keyOf(t);
    const list = map.get(k) ?? [];
    list.push(t);
    map.set(k, list);
  }
  return buckets
    .filter(([k]) => map.has(k))
    .map(([k, label]) => ({ id: `${prefix}:${k}`, label, tasks: map.get(k)! }));
}

export function groupTasks(
  tasks: Task[],
  group: GroupKey,
  sections: Section[],
  ctx: ViewContext,
  tags: { id: string; name: string }[]
): DisplayGroup[] {
  const now = ctx.now ?? new Date();

  switch (group) {
    case "sections": {
      const by = new Map<string, Task[]>();
      for (const t of tasks) {
        const k = t.section_id ?? "none";
        const list = by.get(k) ?? [];
        list.push(t);
        by.set(k, list);
      }
      return [
        { id: "none", label: "Tasks", section: null, tasks: by.get("none") ?? [] },
        ...sections.map((s) => ({
          id: s.id,
          label: s.name,
          section: s,
          tasks: by.get(s.id) ?? [],
        })),
      ];
    }
    case "due":
      return bucketGroups(tasks, DUE_BUCKETS, (t) => dueBucket(t, now), "due");
    case "created":
      return bucketGroups(
        tasks,
        PAST_BUCKETS,
        (t) => pastBucket(t.created_at, now),
        "created"
      );
    case "completed": {
      const groups = bucketGroups(
        tasks.filter((t) => t.completed_at),
        PAST_BUCKETS,
        (t) => pastBucket(t.completed_at as string, now),
        "completed"
      );
      const open = tasks.filter((t) => !t.completed_at);
      if (open.length) {
        groups.unshift({ id: "completed:open", label: "Not completed", tasks: open });
      }
      return groups;
    }
    case "assignee": {
      const out: DisplayGroup[] = ctx.profiles
        .map((p) => ({
          id: `assignee:${p.id}`,
          label: p.id === ctx.meId ? `${p.name} (you)` : p.name,
          tasks: tasks.filter((t) => t.assignee_id === p.id),
        }))
        .filter((g) => g.tasks.length);
      const none = tasks.filter(
        (t) => !t.assignee_id || !ctx.profiles.some((p) => p.id === t.assignee_id)
      );
      if (none.length) out.push({ id: "assignee:none", label: "Unassigned", tasks: none });
      return out;
    }
    case "status": {
      const sorted = [...ctx.statuses].sort((a, b) => a.position - b.position);
      const out: DisplayGroup[] = sorted
        .map((s) => ({
          id: `status:${s.id}`,
          label: s.name,
          tasks: tasks.filter((t) => t.status_id === s.id),
        }))
        .filter((g) => g.tasks.length);
      const none = tasks.filter(
        (t) => !t.status_id || !sorted.some((s) => s.id === t.status_id)
      );
      if (none.length) out.push({ id: "status:none", label: "No status", tasks: none });
      return out;
    }
    case "tag": {
      const sorted = [...tags].sort((a, b) => cmpText(a.name, b.name));
      const out: DisplayGroup[] = sorted
        .map((tag) => ({
          id: `tag:${tag.id}`,
          label: tag.name,
          tasks: tasks.filter((t) => ctx.tagIdsOf(t.id).includes(tag.id)),
        }))
        .filter((g) => g.tasks.length);
      const none = tasks.filter((t) => ctx.tagIdsOf(t.id).length === 0);
      if (none.length) out.push({ id: "tag:none", label: "No tag", tasks: none });
      return out;
    }
  }
}

/* putting it together */

export type Display = {
  groups: DisplayGroup[];
  kids: Map<string, Task[]>;
  numbering: Map<string, string>;
  shown: number;
};

export function buildDisplay(args: {
  tasks: Task[];
  sections: Section[];
  view: ViewConfig;
  ctx: ViewContext;
  tags: { id: string; name: string }[];
}): Display {
  const { tasks, sections, view, ctx, tags } = args;
  const filtersOn = activeFilterCount(view.filters) > 0;
  const f = view.filters;

  const tops = tasks.filter((t) => !t.parent_task_id);
  const childrenByParent = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!t.parent_task_id) continue;
    const list = childrenByParent.get(t.parent_task_id) ?? [];
    list.push(t);
    childrenByParent.set(t.parent_task_id, list);
  }

  const kids = new Map<string, Task[]>();
  const keptTops: Task[] = [];
  for (const top of tops) {
    const children = childrenByParent.get(top.id) ?? [];
    const matchingKids = filtersOn
      ? children.filter((c) => matchesFilters(c, f, ctx))
      : children;
    const selfMatches = !filtersOn || matchesFilters(top, f, ctx);
    if (selfMatches || matchingKids.length) {
      keptTops.push(top);
      kids.set(top.id, sortTasks(matchingKids, view.sort, ctx));
    }
  }

  const sorted = sortTasks(keptTops, view.sort, ctx);
  let groups = groupTasks(sorted, view.group, sections, ctx, tags);
  if (view.group === "sections" && filtersOn) {
    groups = groups.filter((g) => g.tasks.length > 0);
  }

  const numbering = new Map<string, string>();
  let n = 0;
  for (const g of groups) {
    for (const t of g.tasks) {
      if (numbering.has(t.id)) continue;
      n += 1;
      numbering.set(t.id, String(n));
      (kids.get(t.id) ?? []).forEach((kid, j) => {
        numbering.set(kid.id, `${n}.${j + 1}`);
      });
    }
  }

  return { groups, kids, numbering, shown: keptTops.length };
}
