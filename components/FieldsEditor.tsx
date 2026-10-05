"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PRESET_COLORS } from "@/lib/colors";
import {
  FIELD_TYPE_LABELS,
  type FieldDef,
  type FieldOption,
  type FieldType,
} from "@/lib/types";
import ColorChoice from "./ColorChoice";
import Modal from "./Modal";

const TYPES = Object.keys(FIELD_TYPE_LABELS) as FieldType[];

export default function FieldsEditor({
  projectId,
  fields,
  onClose,
  onChanged,
}: {
  projectId: string;
  fields: FieldDef[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<FieldType>("text");
  const [openOptions, setOpenOptions] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...fields].sort((a, b) => a.position - b.position),
    [fields]
  );

  async function patch(id: string, values: Partial<FieldDef>) {
    setError(null);
    const { error } = await supabase
      .from("field_definitions")
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
    const position = sorted.reduce((m, f) => Math.max(m, f.position), 0) + 1;
    const { error } = await supabase.from("field_definitions").insert({
      project_id: projectId,
      name,
      type: newType,
      options: [],
      position,
      visible: true,
    });
    if (error) setError(error.message);
    else {
      setNewName("");
      if (newType === "dropdown" || newType === "multi_select") {
        /* the new column shows up in the list after the refresh, ready for options */
      }
    }
    onChanged();
  }

  async function move(id: string, dir: -1 | 1) {
    const i = sorted.findIndex((f) => f.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= sorted.length) return;
    const a = sorted[i];
    const b = sorted[j];
    setError(null);
    const results = await Promise.all([
      supabase.from("field_definitions").update({ position: b.position }).eq("id", a.id),
      supabase.from("field_definitions").update({ position: a.position }).eq("id", b.id),
    ]);
    const err = results.find((r) => r.error)?.error;
    if (err) setError(err.message);
    onChanged();
  }

  async function remove(field: FieldDef) {
    if (
      !window.confirm(
        `Delete the column "${field.name}"? Everything typed into it is removed from every task.`
      )
    )
      return;
    setError(null);
    const values = await supabase
      .from("task_field_values")
      .delete()
      .eq("field_id", field.id);
    if (values.error) {
      setError(values.error.message);
      return;
    }
    const { error } = await supabase
      .from("field_definitions")
      .delete()
      .eq("id", field.id);
    if (error) setError(error.message);
    onChanged();
  }

  function setOptions(field: FieldDef, options: FieldOption[]) {
    return patch(field.id, { options });
  }

  return (
    <Modal
      title="Columns"
      description="Add your own columns to this project. Both of you see the same columns."
      onClose={onClose}
    >
      <ul className="mt-4 space-y-4">
        {sorted.map((f, index) => {
          const hasOptions = f.type === "dropdown" || f.type === "multi_select";
          return (
            <li key={f.id} className="rounded-lg border border-current/15 p-3">
              <div className="flex items-center gap-2">
                <input
                  key={`${f.id}:${f.name}`}
                  defaultValue={f.name}
                  aria-label="Column name"
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (!v) e.target.value = f.name;
                    else if (v !== f.name) patch(f.id, { name: v });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  className="min-w-0 flex-1 rounded-md border border-current/20 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-current/50"
                />
                <span className="shrink-0 rounded-full border border-current/20 px-2 py-0.5 text-xs opacity-70">
                  {FIELD_TYPE_LABELS[f.type]}
                </span>
                <button
                  type="button"
                  aria-label="Move up"
                  disabled={index === 0}
                  onClick={() => move(f.id, -1)}
                  className="flex size-8 items-center justify-center rounded-md hover:bg-current/10 disabled:opacity-30"
                >
                  {"↑"}
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  disabled={index === sorted.length - 1}
                  onClick={() => move(f.id, 1)}
                  className="flex size-8 items-center justify-center rounded-md hover:bg-current/10 disabled:opacity-30"
                >
                  {"↓"}
                </button>
              </div>

              {hasOptions && (
                <div className="mt-3">
                  <button
                    type="button"
                    aria-expanded={openOptions === f.id}
                    onClick={() => setOpenOptions(openOptions === f.id ? null : f.id)}
                    className="text-sm underline opacity-80 hover:opacity-100"
                  >
                    {f.options.length} option{f.options.length === 1 ? "" : "s"}
                    {openOptions === f.id ? ", hide" : ", edit"}
                  </button>
                  {openOptions === f.id && (
                    <div className="mt-2 space-y-3">
                      {f.options.map((o) => (
                        <div key={o.id} className="space-y-2 rounded-md border border-current/10 p-2">
                          <div className="flex items-center gap-2">
                            <span
                              aria-hidden="true"
                              className="size-3 shrink-0 rounded-full"
                              style={{ backgroundColor: o.color }}
                            />
                            <input
                              key={`${o.id}:${o.name}`}
                              defaultValue={o.name}
                              aria-label="Option name"
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                if (!v) e.target.value = o.name;
                                else if (v !== o.name)
                                  setOptions(
                                    f,
                                    f.options.map((x) => (x.id === o.id ? { ...x, name: v } : x))
                                  );
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                              }}
                              className="min-w-0 flex-1 rounded-md border border-current/20 bg-transparent px-2 py-1 text-sm outline-none focus:border-current/50"
                            />
                            <button
                              type="button"
                              onClick={() => setOptions(f, f.options.filter((x) => x.id !== o.id))}
                              className="text-xs text-red-500 underline"
                            >
                              Remove
                            </button>
                          </div>
                          <ColorChoice
                            value={o.color}
                            onChange={(color) =>
                              setOptions(
                                f,
                                f.options.map((x) => (x.id === o.id ? { ...x, color } : x))
                              )
                            }
                          />
                        </div>
                      ))}
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const input = e.currentTarget.elements.namedItem(
                            "optionName"
                          ) as HTMLInputElement;
                          const name = input.value.trim();
                          if (!name) return;
                          setOptions(f, [
                            ...f.options,
                            {
                              id: crypto.randomUUID(),
                              name,
                              color: PRESET_COLORS[f.options.length % PRESET_COLORS.length],
                            },
                          ]);
                          input.value = "";
                        }}
                        className="flex gap-2"
                      >
                        <input
                          name="optionName"
                          placeholder="New option"
                          aria-label="New option name"
                          className="min-w-0 flex-1 rounded-md border border-current/20 bg-transparent px-2 py-1.5 text-sm outline-none placeholder:opacity-50 focus:border-current/50"
                        />
                        <button
                          type="submit"
                          className="rounded-md border border-current/20 px-3 py-1.5 text-sm hover:border-current/50"
                        >
                          Add
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-3 flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={f.visible}
                    onChange={(e) => patch(f.id, { visible: e.target.checked })}
                    className="size-4 accent-accent"
                  />
                  Show this column
                </label>
                <button
                  type="button"
                  onClick={() => remove(f)}
                  className="text-sm text-red-500 underline"
                >
                  Delete
                </button>
              </div>
            </li>
          );
        })}
        {sorted.length === 0 && (
          <li className="text-sm opacity-60">No custom columns yet.</li>
        )}
      </ul>

      <form onSubmit={add} className="mt-4 space-y-2 border-t border-current/10 pt-4">
        <p className="text-sm font-medium">Add a column</p>
        <div className="flex flex-wrap gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name, for example Priority"
            aria-label="New column name"
            className="min-w-0 flex-1 basis-40 rounded-md border border-current/20 bg-transparent px-3 py-2 text-sm outline-none placeholder:opacity-50 focus:border-current/50"
          />
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as FieldType)}
            aria-label="Column type"
            className="rounded-md border border-current/20 bg-background px-2 py-2 text-sm text-foreground"
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {FIELD_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={!newName.trim()}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Add
          </button>
        </div>
        {(newType === "dropdown" || newType === "multi_select") && (
          <p className="text-xs opacity-60">
            After adding it, open the column here to add its options.
          </p>
        )}
      </form>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-500">
          {error}
        </p>
      )}
    </Modal>
  );
}
