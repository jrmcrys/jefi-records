"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Status } from "@/lib/types";

const PRESETS = [
  "#71717a",
  "#2563eb",
  "#16a34a",
  "#d97706",
  "#dc2626",
  "#9333ea",
  "#0891b2",
  "#db2777",
];

const HEX = /^#[0-9a-fA-F]{6}$/;

export default function StatusEditor({
  projectId,
  statuses,
  onClose,
  onChanged,
}: {
  projectId: string;
  statuses: Status[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const sorted = useMemo(
    () => [...statuses].sort((a, b) => a.position - b.position),
    [statuses]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function patch(id: string, values: Partial<Status>) {
    setError(null);
    const { error } = await supabase
      .from("project_statuses")
      .update(values)
      .eq("id", id);
    if (error) setError(error.message);
    onChanged();
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setError(null);
    const position = sorted.reduce((m, s) => Math.max(m, s.position), 0) + 1;
    const { error } = await supabase.from("project_statuses").insert({
      project_id: projectId,
      name,
      color: PRESETS[sorted.length % PRESETS.length],
      position,
      is_done: false,
    });
    if (error) setError(error.message);
    else setNewName("");
    onChanged();
  }

  async function move(id: string, dir: -1 | 1) {
    const i = sorted.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= sorted.length) return;
    const a = sorted[i];
    const b = sorted[j];
    setError(null);
    const results = await Promise.all([
      supabase
        .from("project_statuses")
        .update({ position: b.position })
        .eq("id", a.id),
      supabase
        .from("project_statuses")
        .update({ position: a.position })
        .eq("id", b.id),
    ]);
    const err = results.find((r) => r.error)?.error;
    if (err) setError(err.message);
    onChanged();
  }

  async function remove(status: Status) {
    if (
      !window.confirm(
        `Delete the status "${status.name}"? Tasks using it will have no status until you pick another.`
      )
    )
      return;
    setError(null);
    const cleared = await supabase
      .from("tasks")
      .update({ status_id: null })
      .eq("status_id", status.id);
    if (cleared.error) {
      setError(cleared.error.message);
      return;
    }
    const { error } = await supabase
      .from("project_statuses")
      .delete()
      .eq("id", status.id);
    if (error) setError(error.message);
    onChanged();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit statuses"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-xl border border-current/20 bg-background p-5 shadow-xl sm:rounded-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Statuses</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 items-center justify-center rounded-md text-lg leading-none opacity-60 hover:bg-current/10 hover:opacity-100"
          >
            {"×"}
          </button>
        </div>
        <p className="mt-1 text-sm opacity-70">
          Rename, recolor, reorder, or add statuses for this project. A status
          marked as done completes the task when picked.
        </p>

        <ul className="mt-4 space-y-4">
          {sorted.map((s, index) => (
            <li
              key={s.id}
              className="rounded-lg border border-current/15 p-3"
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <input
                  key={`${s.id}:${s.name}`}
                  defaultValue={s.name}
                  aria-label="Status name"
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (!v) e.target.value = s.name;
                    else if (v !== s.name) patch(s.id, { name: v });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter")
                      (e.target as HTMLInputElement).blur();
                  }}
                  className="min-w-0 flex-1 rounded-md border border-current/20 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-current/50"
                />
                <button
                  type="button"
                  aria-label="Move up"
                  disabled={index === 0}
                  onClick={() => move(s.id, -1)}
                  className="flex size-8 items-center justify-center rounded-md hover:bg-current/10 disabled:opacity-30"
                >
                  {"↑"}
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  disabled={index === sorted.length - 1}
                  onClick={() => move(s.id, 1)}
                  className="flex size-8 items-center justify-center rounded-md hover:bg-current/10 disabled:opacity-30"
                >
                  {"↓"}
                </button>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Use color ${c}`}
                    aria-pressed={s.color.toLowerCase() === c}
                    onClick={() => patch(s.id, { color: c })}
                    className={`size-6 rounded-full border-2 ${
                      s.color.toLowerCase() === c
                        ? "border-current"
                        : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <input
                  key={`${s.id}:${s.color}`}
                  defaultValue={s.color}
                  aria-label="Hex color"
                  maxLength={7}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (HEX.test(v) && v.toLowerCase() !== s.color.toLowerCase())
                      patch(s.id, { color: v });
                    else e.target.value = s.color;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter")
                      (e.target as HTMLInputElement).blur();
                  }}
                  className="w-24 rounded-md border border-current/20 bg-transparent px-2 py-1 text-xs outline-none focus:border-current/50"
                />
              </div>

              <div className="mt-3 flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={s.is_done}
                    onChange={(e) => patch(s.id, { is_done: e.target.checked })}
                    className="size-4 accent-accent"
                  />
                  Counts as done
                </label>
                <button
                  type="button"
                  disabled={sorted.length <= 1}
                  onClick={() => remove(s)}
                  className="text-sm text-red-500 underline disabled:opacity-30"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>

        <form onSubmit={add} className="mt-4 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New status, for example Waiting on"
            aria-label="New status name"
            className="min-w-0 flex-1 rounded-md border border-current/20 bg-transparent px-3 py-2 text-sm outline-none placeholder:opacity-50 focus:border-current/50"
          />
          <button
            type="submit"
            disabled={!newName.trim()}
            className="rounded-md border border-current/20 px-3 py-2 text-sm hover:border-current/50 disabled:opacity-50"
          >
            Add
          </button>
        </form>

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-500">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
