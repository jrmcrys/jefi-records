"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  FILE_TYPE_LABELS,
  KIND_LABELS,
  findGoogleLinks,
  pageForType,
  parseGoogleFile,
  type GoogleFileType,
  type LinkKind,
} from "@/lib/google";
import { LABEL_COLORS, type LinkRow } from "@/lib/links";
import type { Tag, Visibility } from "@/lib/types";
import Modal from "../Modal";
import ImagePicker, { type PickedImage } from "../ImagePicker";
import ChipPicker from "../ChipPicker";
import LinkIcon from "./LinkIcon";

export type LinkEntry = { url: string; title: string; type: GoogleFileType; kind: LinkKind };

export type LinkDetails = {
  visibility: Visibility;
  emoji: string | null;
  image_url: string | null;
  note: string | null;
  color: string | null;
  section: string | null;
  project_id: string | null;
  task_id: string | null;
  review_on: string | null;
  tagIds: string[];
};

type Draft = { url: string; title: string; typed: boolean };

const input =
  "w-full rounded-md border border-current/20 bg-transparent px-3 py-2 text-sm outline-none placeholder:opacity-50 focus:border-current/50";

function splitLinks(text: string): string[] {
  const found = findGoogleLinks(text);
  if (found.length > 0) return found;
  const t = text.trim();
  return t ? [t] : [];
}

/* The form for adding one or more links, or for editing one. */
export default function LinkForm({
  kind,
  meId,
  link,
  initialText = "",
  canEditAll,
  tags,
  initialTagIds = [],
  sections,
  projects,
  onCreateTag,
  onSubmitNew,
  onSubmitEdit,
  onClose,
}: {
  kind: LinkKind;
  meId: string;
  /** Present when editing. */
  link?: LinkRow;
  initialText?: string;
  /** False when editing someone else's item: only tags can change. */
  canEditAll: boolean;
  tags: Tag[];
  initialTagIds?: string[];
  sections: string[];
  projects: { id: string; name: string }[];
  onCreateTag: (name: string) => Promise<Tag | null>;
  onSubmitNew?: (entries: LinkEntry[], details: LinkDetails) => Promise<string | null>;
  onSubmitEdit?: (values: { title: string } & LinkDetails) => Promise<string | null>;
  onClose: () => void;
}) {
  const editing = Boolean(link);
  const supabase = useMemo(() => createClient(), []);
  const [text, setText] = useState(initialText);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [title, setTitle] = useState(link?.title ?? "");
  const [visibility, setVisibility] = useState<Visibility>(link?.visibility ?? "public");
  const [icon, setIcon] = useState<PickedImage>({
    imageUrl: link?.image_url ?? null,
    emoji: link?.emoji ?? null,
  });
  const [note, setNote] = useState(link?.note ?? "");
  const [color, setColor] = useState<string | null>(link?.color ?? null);
  const [section, setSection] = useState(link?.section ?? "");
  const [projectId, setProjectId] = useState<string>(link?.project_id ?? "");
  const [taskId, setTaskId] = useState<string>(link?.task_id ?? "");
  const [tasks, setTasks] = useState<{ id: string; name: string }[]>([]);
  const [review, setReview] = useState(link?.review_on ?? "");
  const [tagIds, setTagIds] = useState<string[]>(initialTagIds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetched = useRef(new Set<string>());

  /* Read the pasted text into one draft per link, keeping names already typed. */
  const urls = useMemo(() => splitLinks(text), [text]);
  const [lastUrls, setLastUrls] = useState<string>("");
  const urlsKey = urls.join("\n");
  if (!editing && urlsKey !== lastUrls) {
    setLastUrls(urlsKey);
    setDrafts((prev) =>
      urls.map((u) => prev.find((d) => d.url === u) ?? { url: u, title: "", typed: false })
    );
  }

  /* Fill in names from Google where the file is viewable by link. */
  useEffect(() => {
    for (const d of drafts) {
      if (d.typed || d.title || fetched.current.has(d.url) || !parseGoogleFile(d.url)) continue;
      fetched.current.add(d.url);
      fetch(`/api/link-title?url=${encodeURIComponent(d.url)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((res: { title: string | null } | null) => {
          if (!res?.title) return;
          setDrafts((prev) =>
            prev.map((x) => (x.url === d.url && !x.typed && !x.title ? { ...x, title: res.title as string } : x))
          );
        })
        .catch(() => {});
    }
  }, [drafts]);

  /* Tasks for the chosen project, for "Attach to a task". */
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    supabase
      .from("tasks")
      .select("id,name")
      .eq("project_id", projectId)
      .is("completed_at", null)
      .order("created_at", { ascending: false })
      .limit(300)
      .then(({ data }) => {
        if (!cancelled) setTasks((data ?? []) as { id: string; name: string }[]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, supabase]);

  const parsed = drafts.map((d) => ({ draft: d, file: parseGoogleFile(d.url) }));
  const bad = parsed.filter((p) => !p.file);
  const moving = parsed.filter((p) => p.file && pageForType(p.file.type, kind) !== kind);

  function details(): LinkDetails {
    return {
      visibility,
      emoji: icon.emoji,
      image_url: icon.imageUrl,
      note: note.trim() || null,
      color,
      section: section.trim() || null,
      project_id: projectId || null,
      task_id: projectId && taskId ? taskId : null,
      review_on: review || null,
      tagIds,
    };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    let err: string | null = null;
    if (editing) {
      if (!title.trim()) {
        setBusy(false);
        setError("Give it a name.");
        return;
      }
      err = (await onSubmitEdit?.({ title: title.trim(), ...details() })) ?? null;
    } else {
      if (parsed.length === 0) err = "Paste a link first.";
      else if (bad.length > 0)
        err = "Some lines are not Google links. Use links that start with docs.google.com or drive.google.com.";
      else {
        const entries: LinkEntry[] = parsed.map(({ draft, file }) => ({
          url: file!.url,
          title: (parsed.length === 1 ? title.trim() || draft.title : draft.title).trim() ||
            (file!.type === "sheet" ? KIND_LABELS.sheet.untitled : file!.type === "doc" ? KIND_LABELS.doc.untitled : `Untitled ${FILE_TYPE_LABELS[file!.type].toLowerCase()}`),
          type: file!.type,
          kind: pageForType(file!.type, kind),
        }));
        err = (await onSubmitNew?.(entries, details())) ?? null;
      }
    }
    setBusy(false);
    if (err) setError(err);
    else onClose();
  }

  const single = !editing && drafts.length <= 1;
  const singleTitle = single ? title || drafts[0]?.title || "" : "";
  const iconUrl = link?.url ?? parsed[0]?.file?.url ?? "";
  const locked = editing && !canEditAll;

  return (
    <Modal
      title={editing ? "Edit details" : `Add to ${KIND_LABELS[kind].plural}`}
      description={
        locked
          ? "Only the person who added this can change its details. You can change its tags."
          : undefined
      }
      onClose={onClose}
    >
      <form onSubmit={submit} className="mt-4 space-y-4">
        {!editing && (
          <div>
            <label className="text-sm font-medium" htmlFor="link-text">
              Link
            </label>
            <textarea
              id="link-text"
              autoFocus
              rows={drafts.length > 1 ? 4 : 2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Paste a link, ${KIND_LABELS[kind].example}. Paste several to add them all at once.`}
              className={`${input} mt-1 resize-y`}
            />
            {bad.length > 0 && text.trim() && (
              <p className="mt-1 text-xs text-red-500">
                {bad.length === 1 && parsed.length === 1
                  ? "That is not a Google file link yet."
                  : `${bad.length} of these are not Google file links.`}
              </p>
            )}
            {moving.length > 0 && (
              <p className="mt-1 text-xs opacity-70">
                {moving.length === 1 && parsed.length === 1
                  ? `This is a ${FILE_TYPE_LABELS[moving[0].file!.type]}, so it goes on the ${KIND_LABELS[pageForType(moving[0].file!.type, kind)].plural} page.`
                  : `${moving.length} of these go on the ${KIND_LABELS[kind === "doc" ? "sheet" : "doc"].plural} page, because of their type.`}
              </p>
            )}
          </div>
        )}

        {!editing && drafts.length > 1 && (
          <div>
            <p className="text-sm font-medium">Names</p>
            <ul className="mt-1 space-y-1.5">
              {parsed.map(({ draft, file }) => (
                <li key={draft.url} className="flex items-center gap-2">
                  <LinkIcon url={draft.url} size={20} />
                  <input
                    value={draft.title}
                    onChange={(e) =>
                      setDrafts((prev) =>
                        prev.map((x) => (x.url === draft.url ? { ...x, title: e.target.value, typed: true } : x))
                      )
                    }
                    placeholder={file ? FILE_TYPE_LABELS[file.type] : "Not a Google link"}
                    aria-label={`Name for ${draft.url}`}
                    className={`${input} py-1.5`}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}

        {(editing || single) && (
          <div>
            <label className="text-sm font-medium" htmlFor="link-title">
              Name
            </label>
            <div className="mt-1 flex items-center gap-2">
              {!locked && (
                <ImagePicker
                  name={singleTitle || "Item"}
                  value={icon}
                  folder={`links/${meId}`}
                  resetLabel="Use the Google icon"
                  trigger={<LinkIcon url={iconUrl} imageUrl={icon.imageUrl} emoji={icon.emoji} size={36} />}
                  buttonClassName="rounded-md p-0.5 hover:bg-current/10"
                  onChange={(next) => setIcon(next)}
                />
              )}
              <input
                id="link-title"
                value={singleTitle}
                disabled={locked}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (!editing && drafts[0]) {
                    setDrafts((prev) => prev.map((x, i) => (i === 0 ? { ...x, typed: true } : x)));
                  }
                }}
                placeholder={editing ? "" : "Filled in from Google when it can be, or type one"}
                className={`${input} disabled:opacity-60`}
              />
            </div>
          </div>
        )}

        {!locked && (
          <>
            <div>
              <label className="text-sm font-medium" htmlFor="link-note">
                Short note
              </label>
              <input
                id="link-note"
                value={note}
                maxLength={200}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Shown under the name"
                className={`${input} mt-1`}
              />
            </div>

            <div>
              <p className="text-sm font-medium">Who can see it</p>
              <div role="radiogroup" aria-label="Who can see it" className="mt-1 flex overflow-hidden rounded-md border border-current/20 text-sm">
                {(
                  [
                    ["public", "Shared with Effie and Jerome"],
                    ["private", "Only me"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={visibility === value}
                    onClick={() => setVisibility(value)}
                    className={`flex-1 px-3 py-1.5 ${visibility === value ? "bg-accent/15 font-medium" : "opacity-70 hover:bg-current/10"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium" htmlFor="link-section">
                  Section
                </label>
                <input
                  id="link-section"
                  list="link-sections"
                  value={section}
                  maxLength={60}
                  onChange={(e) => setSection(e.target.value)}
                  placeholder="None"
                  className={`${input} mt-1`}
                />
                <datalist id="link-sections">
                  {sections.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="text-sm font-medium" htmlFor="link-review">
                  Review reminder
                </label>
                <input
                  id="link-review"
                  type="date"
                  value={review}
                  onChange={(e) => setReview(e.target.value)}
                  className={`${input} mt-1`}
                />
              </div>
            </div>

            <div>
              <p className="text-sm font-medium">Color label</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setColor(null)}
                  aria-pressed={color === null}
                  className={`rounded-md border px-2 py-1 text-xs ${color === null ? "border-current" : "border-current/20 opacity-70"}`}
                >
                  None
                </button>
                {LABEL_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Color ${c}`}
                    aria-pressed={color === c}
                    onClick={() => setColor(c)}
                    className={`size-7 rounded-full border-2 ${color === c ? "border-current" : "border-transparent"}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium" htmlFor="link-project">
                  Attach to a project
                </label>
                <select
                  id="link-project"
                  value={projectId}
                  onChange={(e) => {
                    setProjectId(e.target.value);
                    setTaskId("");
                    if (!e.target.value) setTasks([]);
                  }}
                  className={`${input} mt-1`}
                >
                  <option value="">None</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium" htmlFor="link-task">
                  and a task
                </label>
                <select
                  id="link-task"
                  value={taskId}
                  disabled={!projectId}
                  onChange={(e) => setTaskId(e.target.value)}
                  className={`${input} mt-1 disabled:opacity-50`}
                >
                  <option value="">None</option>
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </>
        )}

        <div>
          <p className="text-sm font-medium">Tags</p>
          <div className="mt-1">
            <ChipPicker
              label="Tags"
              options={tags}
              selected={tagIds}
              onToggle={(id) =>
                setTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
              }
              onCreate={async (name) => {
                const t = await onCreateTag(name);
                if (t) setTagIds((prev) => (prev.includes(t.id) ? prev : [...prev, t.id]));
              }}
              createLabel="Create tag"
              emptyLabel="No tags"
            />
          </div>
        </div>

        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-md px-3 py-2 text-sm underline opacity-70 hover:opacity-100">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || (!editing && parsed.length === 0)}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Saving..." : editing ? "Save" : drafts.length > 1 ? `Add ${drafts.length}` : "Add"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
