"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ACCENT_PRESETS,
  PALETTE,
  contrast,
  isHex,
  readableOn,
  type ProjectColors,
} from "@/lib/theme";
import type { Visibility } from "@/lib/types";
import ColorRow from "./ColorRow";
import Modal from "./Modal";

type ColorKey = keyof ProjectColors;

const ROWS: { key: ColorKey; label: string; hint: string }[] = [
  { key: "accent", label: "Accent", hint: "Checkboxes, focus rings, highlights" },
  { key: "background", label: "Background", hint: "The project page" },
  { key: "foreground", label: "Text", hint: "Names, labels, and icons" },
];

/* The person's own current colors, read from the page root so that "Default"
   shows what they would see without project colors. */
function personalDefaults(): Record<ColorKey, string> {
  const fallback = {
    accent: PALETTE.accent as string,
    background: PALETTE.light.background as string,
    foreground: PALETTE.light.foreground as string,
  };
  if (typeof window === "undefined") return fallback;
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, alt: string) => {
    const v = styles.getPropertyValue(name).trim();
    return isHex(v) ? v.toLowerCase() : alt;
  };
  return {
    accent: read("--accent", fallback.accent),
    background: read("--background", fallback.background),
    foreground: read("--foreground", fallback.foreground),
  };
}

export default function ProjectColorsEditor({
  projectId,
  visibility,
  initial,
  initialShared,
  onPreview,
  onSaved,
  onClose,
}: {
  projectId: string;
  visibility: Visibility;
  initial: ProjectColors;
  initialShared: boolean;
  onPreview: (colors: ProjectColors | null) => void;
  onSaved: (colors: ProjectColors, shared: boolean) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<ProjectColors>(initial);
  const [shared, setShared] = useState(initialShared);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [base] = useState(personalDefaults);

  const canShare = visibility === "public";
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(initial) ||
    shared !== initialShared;

  useEffect(() => {
    onPreview(draft);
  }, [draft, onPreview]);

  useEffect(() => {
    return () => onPreview(null);
  }, [onPreview]);

  const effective = {
    accent: draft.accent ?? base.accent,
    background: draft.background ?? base.background,
    foreground:
      draft.foreground ??
      (draft.background ? readableOn(draft.background) : base.foreground),
  };
  const ratio = contrast(effective.background, effective.foreground);

  function setColor(key: ColorKey, hex: string) {
    setDraft((d) => ({ ...d, [key]: hex }));
  }

  function clearColor(key: ColorKey) {
    setDraft((d) => {
      const next = { ...d };
      delete next[key];
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const sharedValue = canShare && shared;
    const { error } = await supabase
      .from("projects")
      .update({ appearance: draft, appearance_shared: sharedValue })
      .eq("id", projectId);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    onSaved(draft, sharedValue);
    onClose();
  }

  return (
    <Modal
      title="Project colors"
      description="Colors for this project only. Changes preview right away."
      onClose={onClose}
    >
      <div className="mt-4 rounded-lg border border-current/15 p-4">
        {ROWS.map((row) => (
          <ColorRow
            key={row.key}
            label={row.label}
            hint={row.hint}
            value={effective[row.key]}
            fallback={base[row.key]}
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

      {ratio < 4.5 && (
        <p role="alert" className="mt-3 text-sm text-amber-600">
          Text on this background may be hard to read (contrast{" "}
          {ratio.toFixed(1)}:1, aim for at least 4.5:1). Pick a different text
          or background color, or press Default on Text to let the app choose.
        </p>
      )}

      <fieldset className="mt-5">
        <legend className="text-sm font-medium">Who sees these colors</legend>
        {canShare ? (
          <div className="mt-2 space-y-2 text-sm">
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="project-colors-audience"
                checked={!shared}
                onChange={() => setShared(false)}
                className="mt-1"
              />
              <span>
                Only me
                <span className="block text-xs opacity-60">
                  The other person keeps seeing this project in their own
                  colors.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="project-colors-audience"
                checked={shared}
                onChange={() => setShared(true)}
                className="mt-1"
              />
              <span>
                Everyone in this project
                <span className="block text-xs opacity-60">
                  Both of you see these colors on this project. Only you can
                  change them.
                </span>
              </span>
            </label>
          </div>
        ) : (
          <p className="mt-2 text-sm opacity-70">
            This project is private, so only you see it and these colors.
          </p>
        )}
      </fieldset>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-500">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy || !dirty}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Save colors
        </button>
        <button
          type="button"
          onClick={() => setDraft({})}
          disabled={busy || Object.keys(draft).length === 0}
          className="rounded-md px-3 py-2 text-sm underline opacity-70 hover:opacity-100 disabled:no-underline disabled:opacity-30"
        >
          Remove project colors
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-3 py-2 text-sm underline opacity-70 hover:opacity-100"
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}
