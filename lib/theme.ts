export type Mode = "system" | "light" | "dark";

export type Appearance = {
  mode: Mode;
  accent?: string;
  background?: string;
  sidebar?: string;
  foreground?: string;
};

export const PALETTE = {
  light: { background: "#ffffff", foreground: "#171717", sidebar: "#fafafa" },
  dark: { background: "#0a0a0a", foreground: "#ededed", sidebar: "#111111" },
  accent: "#2563eb",
} as const;

export const ACCENT_PRESETS = [
  "#2563eb",
  "#16a34a",
  "#9333ea",
  "#d97706",
  "#db2777",
  "#0891b2",
  "#52525b",
];

const HEX = /^#[0-9a-f]{6}$/i;

export function isHex(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

export function parseAppearance(raw: unknown): Appearance {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const mode: Mode =
    r.mode === "light" || r.mode === "dark" || r.mode === "system"
      ? r.mode
      : "system";
  const out: Appearance = { mode };
  if (isHex(r.accent)) out.accent = r.accent.toLowerCase();
  if (isHex(r.background)) out.background = r.background.toLowerCase();
  if (isHex(r.sidebar)) out.sidebar = r.sidebar.toLowerCase();
  if (isHex(r.foreground)) out.foreground = r.foreground.toLowerCase();
  return out;
}

function channel(v: number) {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

export function readableOn(background: string): string {
  return luminance(background) > 0.4 ? "#171717" : "#ededed";
}

/* Colors an owner can give a single project. Mode and sidebar stay personal. */
export type ProjectColors = {
  accent?: string;
  background?: string;
  foreground?: string;
};

export function parseProjectColors(raw: unknown): ProjectColors {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const out: ProjectColors = {};
  if (isHex(r.accent)) out.accent = r.accent.toLowerCase();
  if (isHex(r.background)) out.background = r.background.toLowerCase();
  if (isHex(r.foreground)) out.foreground = r.foreground.toLowerCase();
  return out;
}

/* Inline style for the wrapper around a project page. Only validated hex
   values are written. Returns an empty object when nothing is customized. */
export function projectStyle(raw: ProjectColors): Record<string, string> {
  const c = parseProjectColors(raw);
  const style: Record<string, string> = {};
  if (c.accent) style["--accent"] = c.accent;
  if (c.background) {
    style["--background"] = c.background;
    style["backgroundColor"] = c.background;
    style["colorScheme"] = luminance(c.background) > 0.4 ? "light" : "dark";
  }
  const foreground =
    c.foreground ?? (c.background ? readableOn(c.background) : undefined);
  if (foreground) {
    style["--foreground"] = foreground;
    style["color"] = foreground;
  }
  return style;
}

/* Builds the CSS that applies a person's appearance. Only validated hex
   values and fixed keywords are ever written, so the result is safe to inject. */
export function themeCss(raw: Appearance): string {
  const a = parseAppearance(raw);
  const css: string[] = [];

  if (a.mode === "light" || a.mode === "dark") {
    const p = PALETTE[a.mode];
    css.push(
      `:root{color-scheme:${a.mode};--background:${p.background};--foreground:${p.foreground};--sidebar:${p.sidebar}}`
    );
  }

  const decls: string[] = [];
  if (a.background) {
    decls.push(`--background:${a.background}`);
    decls.push(
      `color-scheme:${luminance(a.background) > 0.4 ? "light" : "dark"}`
    );
    if (!a.sidebar) decls.push("--sidebar:var(--background)");
  }
  const foreground =
    a.foreground ?? (a.background ? readableOn(a.background) : undefined);
  if (foreground) decls.push(`--foreground:${foreground}`);
  if (a.sidebar) decls.push(`--sidebar:${a.sidebar}`);
  if (a.accent) decls.push(`--accent:${a.accent}`);
  if (decls.length) css.push(`:root{${decls.join(";")}}`);

  return css.join("");
}
