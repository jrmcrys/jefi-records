import type { LinkKind } from "./google";
import type { Visibility } from "./types";

export type LinkRow = {
  id: string;
  kind: LinkKind;
  title: string;
  url: string;
  visibility: Visibility;
  created_by: string;
  created_at: string;
  emoji: string | null;
  image_url: string | null;
  note: string | null;
  color: string | null;
  section: string | null;
  archived: boolean;
  project_id: string | null;
  task_id: string | null;
  review_on: string | null;
};

export const LINK_COLUMNS =
  "id,kind,title,url,visibility,created_by,created_at,emoji,image_url,note,color,section,archived,project_id,task_id,review_on";

/* One person's own settings for an item: order, pin, and when they last
   opened it. */
export type LinkPref = { position: number; pinned: boolean; last_opened_at: string | null };

export const LABEL_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#8b5cf6", "#ec4899", "#71717a",
];

export const TAG_PALETTE = [
  "#2563eb", "#16a34a", "#d97706", "#dc2626", "#9333ea", "#0891b2", "#db2777", "#71717a",
];

export function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function shortDate(iso: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}
