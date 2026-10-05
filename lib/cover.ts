/* Header (cover) images at the top of a page or project.
   Project covers live in projects.cover and everyone who can see the project
   sees them. Page covers live in profiles.personal.covers and belong to one
   person. */

export type CoverKind = "image" | "gradient" | "color";

export type Cover = {
  kind: CoverKind;
  /** Image address (uploaded to the icons bucket, or a pasted link). */
  url?: string;
  /** Gradient id from GRADIENTS, or a #rrggbb color. */
  value?: string;
  /** Focus point of the image, 0 to 100 on each axis. */
  x: number;
  y: number;
  /** 1 means the image just fills the cover. Up to 3. */
  zoom: number;
  /** Height on a computer screen, in pixels. Phones show 60 percent. */
  height: number;
  /** Dark layer over the cover, 0 to 0.7. */
  dim: number;
  /** Blur in pixels, 0 to 12. */
  blur: number;
  /** Hidden covers keep their settings so they can be shown again. */
  hidden: boolean;
};

export const COVER_MIN_H = 120;
export const COVER_MAX_H = 480;
export const COVER_DEFAULT_H = 220;

export const GRADIENTS: { id: string; label: string; css: string }[] = [
  { id: "dawn", label: "Dawn", css: "linear-gradient(120deg, #fbc2eb 0%, #a6c1ee 100%)" },
  { id: "peach", label: "Peach", css: "linear-gradient(120deg, #ffecd2 0%, #fcb69f 100%)" },
  { id: "mint", label: "Mint", css: "linear-gradient(120deg, #d4fc79 0%, #96e6a1 100%)" },
  { id: "sky", label: "Sky", css: "linear-gradient(120deg, #89f7fe 0%, #66a6ff 100%)" },
  { id: "lagoon", label: "Lagoon", css: "linear-gradient(135deg, #0f766e 0%, #22d3ee 100%)" },
  { id: "forest", label: "Forest", css: "linear-gradient(135deg, #134e4a 0%, #4d7c0f 100%)" },
  { id: "sunset", label: "Sunset", css: "linear-gradient(120deg, #f6d365 0%, #fda085 50%, #f5576c 100%)" },
  { id: "berry", label: "Berry", css: "linear-gradient(135deg, #7f1d1d 0%, #be185d 50%, #7c3aed 100%)" },
  { id: "night", label: "Night", css: "linear-gradient(135deg, #0f172a 0%, #312e81 60%, #6d28d9 100%)" },
  { id: "ink", label: "Ink", css: "linear-gradient(135deg, #111827 0%, #374151 100%)" },
  { id: "sand", label: "Sand", css: "linear-gradient(120deg, #f5f0e6 0%, #e2cfa8 100%)" },
  { id: "aurora", label: "Aurora", css: "linear-gradient(120deg, #43e97b 0%, #38f9d7 40%, #6a82fb 100%)" },
];

export const COVER_COLORS = [
  "#f87171", "#fb923c", "#facc15", "#4ade80", "#2dd4bf", "#38bdf8",
  "#818cf8", "#c084fc", "#f472b6", "#e5e7eb", "#6b7280", "#1f2937",
];

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const num = (v: unknown, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const HEX = /^#[0-9a-f]{6}$/i;

export function baseCover(kind: CoverKind, extra: Partial<Cover> = {}): Cover {
  return {
    kind,
    x: 50,
    y: 50,
    zoom: 1,
    height: COVER_DEFAULT_H,
    dim: 0,
    blur: 0,
    hidden: false,
    ...extra,
  };
}

/* Only accepts http(s) image links, so nothing else ends up in a style. */
export function safeImageUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function parseCover(raw: unknown): Cover | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const kind: CoverKind | null =
    r.kind === "image" || r.kind === "gradient" || r.kind === "color" ? r.kind : null;
  if (!kind) return null;
  const cover = baseCover(kind, {
    x: clamp(num(r.x, 50), 0, 100),
    y: clamp(num(r.y, 50), 0, 100),
    zoom: clamp(num(r.zoom, 1), 1, 3),
    height: clamp(num(r.height, COVER_DEFAULT_H), COVER_MIN_H, COVER_MAX_H),
    dim: clamp(num(r.dim, 0), 0, 0.7),
    blur: clamp(num(r.blur, 0), 0, 12),
    hidden: r.hidden === true,
  });
  if (kind === "image") {
    const url = typeof r.url === "string" ? safeImageUrl(r.url) : null;
    if (!url) return null;
    cover.url = url;
  } else if (kind === "gradient") {
    if (!GRADIENTS.some((g) => g.id === r.value)) return null;
    cover.value = r.value as string;
  } else {
    if (typeof r.value !== "string" || !HEX.test(r.value)) return null;
    cover.value = r.value;
  }
  return cover;
}

export function coverBackground(c: Cover): string | undefined {
  if (c.kind === "gradient") return GRADIENTS.find((g) => g.id === c.value)?.css;
  if (c.kind === "color") return c.value;
  return undefined;
}

export function isShown(c: Cover | null | undefined): c is Cover {
  return Boolean(c && !c.hidden);
}
