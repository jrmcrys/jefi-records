"use client";

import { useState } from "react";
import { usePersonal } from "./PersonalProvider";
import { DEFAULT_INTRO, type PageKey } from "@/lib/personal";

/* The short line under a page title. It can be reworded here and the change
   is saved for you only. */
export default function PageIntro({ page }: { page: PageKey }) {
  const { personal, update } = usePersonal();
  const custom = personal.intro[page];
  const text = custom ?? DEFAULT_INTRO[page];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [error, setError] = useState<string | null>(null);

  async function save(value: string | null) {
    setError(null);
    const err = await update((p) => {
      const intro = { ...p.intro };
      if (value === null) delete intro[page];
      else intro[page] = value.slice(0, 600);
      return { ...p, intro };
    });
    if (err) {
      setError(err);
      return;
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <form
        className="mt-2 max-w-2xl"
        onSubmit={(e) => {
          e.preventDefault();
          void save(draft.trim() === DEFAULT_INTRO[page] ? null : draft.trim());
        }}
      >
        <label className="sr-only" htmlFor={`intro-${page}`}>
          Intro text for this page
        </label>
        <textarea
          id={`intro-${page}`}
          autoFocus
          value={draft}
          maxLength={600}
          rows={3}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
          }}
          className="w-full rounded-md border border-current/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-current/50"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <button type="submit" className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white">
            Save
          </button>
          <button type="button" onClick={() => setEditing(false)} className="rounded-md px-3 py-1.5 underline opacity-70 hover:opacity-100">
            Cancel
          </button>
          {custom !== undefined && (
            <button
              type="button"
              onClick={() => void save(null)}
              className="rounded-md px-3 py-1.5 underline opacity-70 hover:opacity-100"
            >
              Use the default text
            </button>
          )}
        </div>
        {error && <p role="alert" className="mt-2 text-sm text-red-500">{error}</p>}
      </form>
    );
  }

  return (
    <p className="mt-1 max-w-2xl text-sm opacity-70">
      {text}{" "}
      <button
        type="button"
        onClick={() => {
          setDraft(text);
          setEditing(true);
        }}
        className="underline opacity-80 hover:opacity-100"
      >
        Edit
      </button>
    </p>
  );
}
