import type { FieldDef, FieldType } from "./types";

/* Each person's table setup for one project: which columns show, in what
   order, which are pinned, how wide, and how tall the rows are. Column keys
   are "status", "assignee", "due", "tags", or "f:<field id>" for a custom
   column. The task name is always the first column and cannot be hidden. */

export type RowHeight = "compact" | "large";

export type TablePrefs = {
  hidden: string[];
  order: string[];
  pinned: string[];
  widths: Record<string, number>;
  rowHeight: RowHeight;
};

export const BUILTIN_KEYS = ["status", "assignee", "due", "tags"] as const;

export const BUILTIN_LABELS: Record<string, string> = {
  status: "Status",
  assignee: "Assignee",
  due: "Due date",
  tags: "Tags",
};

/* A new project starts with just the task and its due date. */
export const DEFAULT_HIDDEN = ["status", "assignee", "tags"];

export const DEFAULT_PREFS: TablePrefs = {
  hidden: DEFAULT_HIDDEN,
  order: [],
  pinned: [],
  widths: {},
  rowHeight: "large",
};

export const BUILTIN_WIDTH: Record<string, number> = {
  status: 170,
  assignee: 190,
  due: 160,
  tags: 220,
};

export const FIELD_WIDTH: Record<FieldType, number> = {
  dropdown: 170,
  multi_select: 220,
  text: 190,
  number: 130,
  url: 210,
  checkbox: 110,
  person: 190,
};

export const MAX_WIDTH = 640;

export function minWidth(key: string): number {
  if (key === "name") return 200;
  if (key === "status") return 120;
  if (key === "assignee") return 130;
  return 110;
}

export type TableCol = { key: string; label: string; width: number };

/* Every column that exists for a project, in the default order. */
export function allColumnKeys(fields: FieldDef[]): string[] {
  return [
    ...BUILTIN_KEYS,
    ...[...fields]
      .sort((a, b) => a.position - b.position)
      .map((f) => `f:${f.id}`),
  ];
}

/* Saved order first, then anything the saved order does not mention yet. */
export function orderedKeys(prefs: TablePrefs, fields: FieldDef[]): string[] {
  const all = allColumnKeys(fields);
  const known = new Set(all);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of prefs.order) {
    if (known.has(k) && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  for (const k of all) if (!seen.has(k)) out.push(k);
  return out;
}

/* The columns to draw: hidden ones removed, pinned ones first. */
export function visibleKeys(prefs: TablePrefs, fields: FieldDef[]): string[] {
  const hidden = new Set(prefs.hidden);
  const ordered = orderedKeys(prefs, fields).filter((k) => !hidden.has(k));
  const pinned = new Set(prefs.pinned);
  return [
    ...ordered.filter((k) => pinned.has(k)),
    ...ordered.filter((k) => !pinned.has(k)),
  ];
}

export function columnLabel(key: string, fields: FieldDef[]): string {
  if (key.startsWith("f:")) {
    return fields.find((f) => `f:${f.id}` === key)?.name ?? "Column";
  }
  return BUILTIN_LABELS[key] ?? key;
}

export function defaultWidth(key: string, fields: FieldDef[]): number {
  if (key.startsWith("f:")) {
    const f = fields.find((x) => `f:${x.id}` === key);
    return f?.width ?? (f ? FIELD_WIDTH[f.type] : 170);
  }
  return BUILTIN_WIDTH[key] ?? 170;
}

/* Read a saved row, tolerating anything odd in it. */
export function parsePrefs(row: unknown): TablePrefs {
  if (!row || typeof row !== "object") return DEFAULT_PREFS;
  const r = row as Record<string, unknown>;
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  const widths: Record<string, number> = {};
  if (r.widths && typeof r.widths === "object") {
    for (const [k, v] of Object.entries(r.widths as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) {
        widths[k] = Math.min(MAX_WIDTH, Math.max(minWidth(k), v));
      }
    }
  }
  return {
    hidden: strings(r.hidden),
    order: strings(r.col_order),
    pinned: strings(r.pinned),
    widths,
    rowHeight: r.row_height === "compact" ? "compact" : "large",
  };
}

/* Width of a piece of text in the table's font, for "fit to content". */
let canvas: HTMLCanvasElement | null = null;
export function textWidth(text: string, bold = false): number {
  if (typeof document === "undefined") return text.length * 8;
  canvas ??= document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return text.length * 8;
  ctx.font = `${bold ? "600 " : ""}14px system-ui, sans-serif`;
  return ctx.measureText(text).width;
}
