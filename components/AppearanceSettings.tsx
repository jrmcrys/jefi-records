"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ColorRow from "./ColorRow";
import { surpriseColors } from "@/lib/surprise";
import {
  ACCENT_PRESETS,
  PALETTE,
  contrast,
  readableOn,
  themeCss,
  type Appearance,
  type Mode,
} from "@/lib/theme";

type ColorKey =
  | "accent"
  | "background"
  | "sidebar"
  | "foreground"
  | "selected"
  | "badge";

type Row = { key: ColorKey; label: string; hint: string };

const THEME_ROWS: Row[] = [
  { key: "sidebar", label: "Sidebar", hint: "The panel on the left" },
  { key: "selected", label: "Selected items", hint: "The page you are on in the sidebar" },
  { key: "accent", label: "Buttons", hint: "Buttons, checkboxes, focus rings, highlights" },
  { key: "badge", label: "Notification badge", hint: "The unread count on Inbox" },
];

const PAGE_ROWS: Row[] = [
  { key: "background", label: "Background", hint: "The main page" },
  { key: "foreground", label: "Text", hint: "Names, labels, and icons" },
];


const MODES: { value: Mode; label: string }[] = [
  { value: "system", label: "Match my device" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function subscribeDark(callback: () => void) {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function systemIsDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export default function AppearanceSettings({
  userId,
  initial,
}: {
  userId: string;
  initial: Appearance;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Appearance>(initial);
  const [saved, setSaved] = useState<Appearance>(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const systemDark = useSyncExternalStore(subscribeDark, systemIsDark, () => false);

  const resolvedMode: "light" | "dark" =
    draft.mode === "system" ? (systemDark ? "dark" : "light") : draft.mode;
  const base = PALETTE[resolvedMode];

  const effective = {
    background: draft.background ?? base.background,
    foreground:
      draft.foreground ??
      (draft.background ? readableOn(draft.background) : base.foreground),
    sidebar: draft.sidebar ?? (draft.background ?? base.sidebar),
    accent: draft.accent ?? PALETTE.accent,
    selected: draft.selected ?? PALETTE.selected[resolvedMode],
    badge: draft.badge ?? draft.accent ?? PALETTE.accent,
  };
  const ratio = contrast(effective.background, effective.foreground);

  /* Live preview: an extra style element, removed again when leaving the page. */
  useEffect(() => {
    let el = document.getElementById("jefi-theme-preview") as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = "jefi-theme-preview";
      document.body.appendChild(el);
    }
    el.textContent = themeCss(draft);
  }, [draft]);

  useEffect(() => {
    return () => {
      document.getElementById("jefi-theme-preview")?.remove();
    };
  }, []);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  function setColor(key: ColorKey, hex: string) {
    setMessage(null);
    setDraft((d) => ({ ...d, [key]: hex }));
  }

  function clearColor(key: ColorKey) {
    setMessage(null);
    setDraft((d) => {
      const next = { ...d };
      delete next[key];
      return next;
    });
  }

  function surprise() {
    setMessage(null);
    const set = surpriseColors();
    setDraft((d) => ({
      ...d,
      sidebar: set.sidebar,
      selected: set.selected,
      accent: set.accent,
      badge: set.badge,
    }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ appearance: draft })
      .eq("id", userId);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSaved(draft);
    setMessage("Appearance saved. It follows you on every device.");
    router.refresh();
  }

  function renderRows(rows: Row[]) {
    return (
      <div className="mt-3 rounded-lg border border-current/15 p-4">
        {rows.map((row) => (
          <ColorRow
            key={row.key}
            label={row.label}
            hint={row.hint}
            value={effective[row.key]}
            fallback={
              row.key === "accent"
                ? PALETTE.accent
                : row.key === "sidebar"
                  ? base.sidebar
                  : row.key === "selected"
                    ? PALETTE.selected[resolvedMode]
                    : row.key === "badge"
                      ? effective.accent
                      : base[row.key]
            }
            isCustom={draft[row.key] !== undefined}
            onChange={(hex) => setColor(row.key, hex)}
            onClear={() => clearColor(row.key)}
          >
            {row.key === "accent" && (
              <div className="mt-3 flex flex-wrap gap-2">
                {ACCENT_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Use accent ${c}`}
                    aria-pressed={effective.accent.toLowerCase() === c}
                    onClick={() => setColor("accent", c)}
                    className={`size-7 rounded-full border-2 ${
                      effective.accent.toLowerCase() === c
                        ? "border-current"
                        : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            )}
          </ColorRow>
        ))}
      </div>
    );
  }

  return (
    <section className="mt-10">
      <h2 className="text-sm font-medium">Appearance</h2>
      <p className="mt-1 text-xs opacity-60">
        Changes preview right away. Your choices are yours alone and do not
        change how the app looks for anyone else.
      </p>

      <div
        role="radiogroup"
        aria-label="Light or dark mode"
        className="mt-4 flex overflow-hidden rounded-md border border-current/20 text-sm"
      >
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={draft.mode === m.value}
            onClick={() => {
              setMessage(null);
              setDraft((d) => ({ ...d, mode: m.value }));
            }}
            className={`flex-1 px-3 py-2 ${
              draft.mode === m.value
                ? "bg-accent/15 font-medium"
                : "opacity-70 hover:bg-current/10"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Theme colors</h3>
        <button
          type="button"
          onClick={surprise}
          className="rounded-md border border-current/20 px-3 py-1.5 text-sm hover:border-current/50"
        >
          Surprise me
        </button>
      </div>
      <p className="mt-1 text-xs opacity-60">
        Surprise me picks a matching set that stays readable in light and dark
        mode. Press it again for another, then Save appearance to keep it.
      </p>
      {renderRows(THEME_ROWS)}

      <h3 className="mt-6 text-sm font-medium">Page colors</h3>
      {renderRows(PAGE_ROWS)}

      {ratio < 4.5 && (
        <p role="alert" className="mt-3 text-sm text-amber-600">
          Text on this background may be hard to read (contrast {ratio.toFixed(1)}
          :1, aim for at least 4.5:1). Pick a different text or background
          color, or press Default on Text to let the app choose.
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy || !dirty}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Save appearance
        </button>
        <button
          type="button"
          onClick={() => {
            setMessage(null);
            setDraft({ mode: "system" });
          }}
          disabled={busy || (draft.mode === "system" && Object.keys(draft).length === 1)}
          className="rounded-md px-3 py-2 text-sm underline opacity-70 hover:opacity-100 disabled:no-underline disabled:opacity-30"
        >
          Reset everything
        </button>
        {dirty && <span className="text-xs opacity-60">Not saved yet</span>}
      </div>

      {message && (
        <p role="status" className="mt-3 text-sm">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-500">
          {error}
        </p>
      )}
    </section>
  );
}
