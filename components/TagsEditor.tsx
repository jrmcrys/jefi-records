"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PRESET_COLORS } from "@/lib/colors";
import type { Tag } from "@/lib/types";
import ColorChoice from "./ColorChoice";
import Modal from "./Modal";

export default function TagsEditor({
  tags,
  followedIds,
  meId,
  onClose,
  onChanged,
}: {
  tags: Tag[];
  followedIds: Set<string>;
  meId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const sorted = useMemo(
    () => [...tags].sort((a, b) => a.name.localeCompare(b.name)),
    [tags]
  );

  async function patch(id: string, values: Partial<Tag>) {
    setError(null);
    const { error } = await supabase.from("tags").update(values).eq("id", id);
    if (error) {
      setError(
        error.code === "23505" ? "A tag with that name already exists." : error.message
      );
    }
    onChanged();
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setError(null);
    const { error } = await supabase.from("tags").insert({
      name,
      color: PRESET_COLORS[tags.length % PRESET_COLORS.length],
    });
    if (error) {
      setError(
        error.code === "23505" ? "A tag with that name already exists." : error.message
      );
    } else setNewName("");
    onChanged();
  }

  async function remove(tag: Tag) {
    if (
      !window.confirm(
        `Delete the tag "${tag.name}"? It is removed from every task in every project.`
      )
    )
      return;
    setError(null);
    const used = await supabase.from("task_tags").delete().eq("tag_id", tag.id);
    if (used.error) {
      setError(used.error.message);
      return;
    }
    await supabase.from("tag_follows").delete().eq("tag_id", tag.id);
    const { error } = await supabase.from("tags").delete().eq("id", tag.id);
    if (error) setError(error.message);
    onChanged();
  }

  async function toggleFollow(tag: Tag) {
    setError(null);
    const { error } = followedIds.has(tag.id)
      ? await supabase
          .from("tag_follows")
          .delete()
          .eq("tag_id", tag.id)
          .eq("user_id", meId)
      : await supabase.from("tag_follows").insert({ tag_id: tag.id, user_id: meId });
    if (error) setError(error.message);
    onChanged();
  }

  return (
    <Modal
      title="Tags"
      description="Tags are shared by both of you and work in every project. Follow a tag to get a notification when it is added to a task."
      onClose={onClose}
    >
      <ul className="mt-4 space-y-4">
        {sorted.map((t) => (
          <li key={t.id} className="rounded-lg border border-current/15 p-3">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-3 shrink-0 rounded-full"
                style={{ backgroundColor: t.color }}
              />
              <input
                key={`${t.id}:${t.name}`}
                defaultValue={t.name}
                aria-label="Tag name"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (!v) e.target.value = t.name;
                  else if (v !== t.name) patch(t.id, { name: v });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                className="min-w-0 flex-1 rounded-md border border-current/20 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-current/50"
              />
            </div>
            <div className="mt-3">
              <ColorChoice value={t.color} onChange={(color) => patch(t.id, { color })} />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={followedIds.has(t.id)}
                  onChange={() => toggleFollow(t)}
                  className="size-4 accent-accent"
                />
                Notify me when it is added
              </label>
              <button
                type="button"
                onClick={() => remove(t)}
                className="text-sm text-red-500 underline"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
        {sorted.length === 0 && <li className="text-sm opacity-60">No tags yet.</li>}
      </ul>

      <form onSubmit={add} className="mt-4 flex gap-2 border-t border-current/10 pt-4">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New tag"
          aria-label="New tag name"
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
    </Modal>
  );
}
