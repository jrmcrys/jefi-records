"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { JSONContent } from "@tiptap/react";
import { createClient } from "@/lib/supabase/client";
import {
  EMPTY_DOC,
  NOTE_LIST_COLUMNS,
  TRASH_DAYS,
  wordCount,
  type FolderRow,
  type NotePref,
  type NoteRow,
} from "@/lib/notes";
import { TAG_PALETTE, relativeTime } from "@/lib/links";
import { PROFILE_COLUMNS, type Profile, type Tag } from "@/lib/types";
import PageCover from "../PageCover";
import PageIntro from "../PageIntro";
import Menu, { MenuItem } from "../Menu";
import Popover from "../Popover";
import ChipPicker, { ChipBadge } from "../ChipPicker";
import ImagePicker from "../ImagePicker";
import ProjectImage from "../ProjectImage";
import NoteEditor from "./NoteEditor";

type View =
  | { kind: "all" }
  | { kind: "folder"; id: string }
  | { kind: "shared" }
  | { kind: "archived" }
  | { kind: "trash" }
  | { kind: "tag"; id: string };

type Sort = "edited" | "created" | "title";

type Open = { id: string; content: JSONContent; version: number };

const FOLDER_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899", "#71717a"];

function sameView(a: View, b: View) {
  return a.kind === b.kind && ("id" in a ? a.id : "") === ("id" in b ? b.id : "");
}

function snippet(n: NoteRow): string {
  const lines = n.text.split("\n").map((l) => l.trim()).filter(Boolean);
  const body = n.title ? lines : lines.slice(1);
  return body.join(" ").slice(0, 140);
}

function displayTitle(n: NoteRow): string {
  return n.title.trim() || n.text.split("\n").find((l) => l.trim())?.trim().slice(0, 80) || "New note";
}

function FolderGlyph({ color }: { color: string | null }) {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" className="shrink-0">
      <path d="M1.5 4.2c0-.7.6-1.2 1.2-1.2h3.4l1.4 1.5h5.8c.7 0 1.2.5 1.2 1.2v6.6c0 .7-.5 1.2-1.2 1.2H2.7c-.7 0-1.2-.5-1.2-1.2z" fill={color ?? "currentColor"} fillOpacity={color ? 0.9 : 0.35} />
    </svg>
  );
}

export default function NotesPage({ meId }: { meId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [prefs, setPrefs] = useState<Map<string, NotePref>>(new Map());
  const [tags, setTags] = useState<Tag[]>([]);
  const [noteTags, setNoteTags] = useState<Map<string, string[]>>(new Map());
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ kind: "all" });
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("edited");
  const [open, setOpen] = useState<Open | null>(null);
  const [pane, setPane] = useState<"folders" | "list" | "note">("list");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newFolderIn, setNewFolderIn] = useState<string | null | undefined>(undefined);
  const [save, setSave] = useState<"saved" | "saving" | "error">("saved");
  const [incoming, setIncoming] = useState<JSONContent | null>(null);
  const pending = useRef<{ id: string; json: JSONContent; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openIdRef = useRef<string | null>(null);

  const selectedId = params.get("note");

  const load = useCallback(async () => {
    const [n, f, p, t, nt, pr] = await Promise.all([
      supabase.from("notes").select(NOTE_LIST_COLUMNS).order("updated_at", { ascending: false }),
      supabase.from("note_folders").select("id,owner_id,parent_id,name,emoji,color,position").order("position").order("name"),
      supabase.from("note_prefs").select("note_id,pinned,last_opened_at"),
      supabase.from("tags").select("id,name,color").order("name"),
      supabase.from("note_tags").select("note_id,tag_id"),
      supabase.from("profiles").select(PROFILE_COLUMNS),
    ]);
    const err = n.error ?? f.error ?? p.error ?? t.error ?? nt.error ?? pr.error;
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    const rows = (n.data ?? []) as NoteRow[];
    /* Empty the trash of anything older than 30 days. */
    const cutoff = Date.now() - TRASH_DAYS * 86400_000;
    const expired = rows.filter((r) => r.owner_id === meId && r.deleted_at && new Date(r.deleted_at).getTime() < cutoff);
    if (expired.length) {
      void supabase.from("notes").delete().in("id", expired.map((r) => r.id));
    }
    setNotes(rows.filter((r) => !expired.includes(r)));
    setFolders((f.data ?? []) as FolderRow[]);
    setPrefs(
      new Map(((p.data ?? []) as ({ note_id: string } & NotePref)[]).map((r) => [r.note_id, { pinned: r.pinned, last_opened_at: r.last_opened_at }]))
    );
    setTags((t.data ?? []) as Tag[]);
    const byNote = new Map<string, string[]>();
    for (const r of (nt.data ?? []) as { note_id: string; tag_id: string }[]) {
      byNote.set(r.note_id, [...(byNote.get(r.note_id) ?? []), r.tag_id]);
    }
    setNoteTags(byNote);
    setProfiles((pr.data ?? []) as Profile[]);
    setLoading(false);
  }, [supabase, meId]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  /* Open the note named in the address. */
  const openNote = useCallback(
    async (id: string) => {
      const { data, error } = await supabase.from("notes").select("id,content").eq("id", id).maybeSingle();
      if (error || !data) {
        setError(error?.message ?? "That note is not available.");
        return;
      }
      openIdRef.current = id;
      setIncoming(null);
      setOpen((prev) => ({ id, content: (data.content as JSONContent) ?? EMPTY_DOC, version: (prev?.version ?? 0) + 1 }));
      setPane("note");
      void supabase
        .from("note_prefs")
        .upsert({ user_id: meId, note_id: id, last_opened_at: new Date().toISOString() }, { onConflict: "user_id,note_id" });
    },
    [supabase, meId]
  );

  useEffect(() => {
    if (!selectedId || selectedId === openIdRef.current) return;
    const t = setTimeout(() => void openNote(selectedId), 0);
    return () => clearTimeout(t);
  }, [selectedId, openNote]);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    setSave("saving");
    const { error } = await supabase.from("notes").update({ content: p.json, text: p.text.slice(0, 200_000) }).eq("id", p.id);
    if (error) {
      setSave("error");
      setError(error.message);
      pending.current = pending.current ?? p;
    } else {
      setSave(pending.current ? "saving" : "saved");
    }
  }, [supabase]);

  /* Save before leaving the page. */
  useEffect(() => {
    const onHide = () => void flush();
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      void flush();
    };
  }, [flush]);

  /* Live updates from the other person. */
  useEffect(() => {
    const channel = supabase
      .channel("notes-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "notes" }, (payload) => {
        const row = payload.new as (NoteRow & { content?: JSONContent }) | undefined;
        if (payload.eventType === "UPDATE" && row && row.id === openIdRef.current && row.updated_by && row.updated_by !== meId && row.content) {
          if (pending.current) setIncoming(row.content);
          else
            setOpen((prev) => (prev && prev.id === row.id ? { ...prev, content: row.content as JSONContent, version: prev.version + 1 } : prev));
        }
        void load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "note_folders" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "note_tags" }, () => void load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, load, meId]);

  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  const current = notes.find((n) => n.id === open?.id) ?? null;
  const mine = current?.owner_id === meId;

  /* Folder tree helpers. */
  const childrenOf = useMemo(() => {
    const m = new Map<string | null, FolderRow[]>();
    for (const f of folders) m.set(f.parent_id, [...(m.get(f.parent_id) ?? []), f]);
    return m;
  }, [folders]);

  const descendants = useCallback(
    (id: string): Set<string> => {
      const out = new Set<string>([id]);
      const walk = (fid: string) => {
        for (const c of childrenOf.get(fid) ?? []) {
          out.add(c.id);
          walk(c.id);
        }
      };
      walk(id);
      return out;
    },
    [childrenOf]
  );

  const live = (n: NoteRow) => !n.deleted_at && !n.archived;

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const n of notes) if (live(n) && n.owner_id === meId && n.folder_id) c.set(n.folder_id, (c.get(n.folder_id) ?? 0) + 1);
    return c;
  }, [notes, meId]);

  const usedTags = useMemo(() => {
    const ids = new Set<string>();
    for (const [nid, list] of noteTags) if (notes.some((n) => n.id === nid && live(n))) list.forEach((t) => ids.add(t));
    return tags.filter((t) => ids.has(t.id));
  }, [noteTags, notes, tags]);

  const listed = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = notes.filter((n) => {
      switch (view.kind) {
        case "all":
          return live(n) && (n.owner_id === meId || n.visibility === "shared");
        case "shared":
          return live(n) && n.visibility === "shared";
        case "folder":
          return live(n) && n.owner_id === meId && n.folder_id !== null && descendants(view.id).has(n.folder_id);
        case "archived":
          return !n.deleted_at && n.archived && n.owner_id === meId;
        case "trash":
          return Boolean(n.deleted_at) && n.owner_id === meId;
        case "tag":
          return live(n) && (noteTags.get(n.id) ?? []).includes(view.id);
      }
    });
    if (q) list = list.filter((n) => `${n.title}\n${n.text}`.toLowerCase().includes(q));
    list = [...list].sort((a, b) =>
      sort === "title"
        ? displayTitle(a).localeCompare(displayTitle(b))
        : sort === "created"
          ? b.created_at.localeCompare(a.created_at)
          : b.updated_at.localeCompare(a.updated_at)
    );
    if (view.kind !== "trash" && view.kind !== "archived") {
      list = [...list.filter((n) => prefs.get(n.id)?.pinned), ...list.filter((n) => !prefs.get(n.id)?.pinned)];
    }
    return list;
  }, [notes, view, query, sort, prefs, noteTags, meId, descendants]);

  function select(id: string | null) {
    void flush();
    const url = id ? `${pathname}?note=${id}` : pathname;
    router.replace(url, { scroll: false });
    if (!id) {
      openIdRef.current = null;
      setOpen(null);
      setPane("list");
    }
  }

  async function createNote() {
    await flush();
    const folderId = view.kind === "folder" ? view.id : null;
    const { data, error } = await supabase
      .from("notes")
      .insert({
        owner_id: meId,
        folder_id: folderId,
        visibility: view.kind === "shared" ? "shared" : "private",
        content: EMPTY_DOC,
      })
      .select(NOTE_LIST_COLUMNS)
      .single();
    if (error || !data) {
      setError(error?.message ?? "Could not create a note.");
      return;
    }
    const row = data as NoteRow;
    if (view.kind === "tag") await supabase.from("note_tags").insert({ note_id: row.id, tag_id: view.id });
    if (view.kind === "trash" || view.kind === "archived") setView({ kind: "all" });
    setNotes((prev) => [row, ...prev]);
    select(row.id);
    setTimeout(() => document.getElementById("note-title")?.focus(), 150);
  }

  async function patchNote(id: string, values: Partial<NoteRow>) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...values } : n)));
    const { error } = await supabase.from("notes").update(values).eq("id", id);
    if (error) {
      setError(error.message);
      void load();
    }
  }

  async function setPinned(id: string, pinned: boolean) {
    setPrefs((prev) => new Map(prev).set(id, { pinned, last_opened_at: prev.get(id)?.last_opened_at ?? null }));
    const { error } = await supabase.from("note_prefs").upsert({ user_id: meId, note_id: id, pinned }, { onConflict: "user_id,note_id" });
    if (error) setError(error.message);
  }

  async function trash(n: NoteRow) {
    await flush();
    await patchNote(n.id, { deleted_at: new Date().toISOString() });
    if (open?.id === n.id) select(null);
  }

  async function deleteForever(n: NoteRow) {
    if (!window.confirm(`Delete "${displayTitle(n)}" forever? This cannot be undone.`)) return;
    setNotes((prev) => prev.filter((x) => x.id !== n.id));
    if (open?.id === n.id) select(null);
    const { data: files } = await supabase.storage.from("notes").list(n.id, { limit: 1000 });
    if (files?.length) await supabase.storage.from("notes").remove(files.map((f) => `${n.id}/${f.name}`));
    const { error } = await supabase.from("notes").delete().eq("id", n.id);
    if (error) {
      setError(error.message);
      void load();
    }
  }

  async function createTag(name: string): Promise<Tag | null> {
    const existing = tags.find((t) => t.name.toLowerCase() === name.trim().toLowerCase());
    if (existing) return existing;
    const { data, error } = await supabase
      .from("tags")
      .insert({ name: name.trim(), color: TAG_PALETTE[tags.length % TAG_PALETTE.length] })
      .select("id,name,color")
      .single();
    if (error || !data) {
      setError(error?.message ?? "Could not create the tag.");
      return null;
    }
    setTags((prev) => [...prev, data as Tag]);
    return data as Tag;
  }

  async function toggleTag(noteId: string, tagId: string) {
    const has = (noteTags.get(noteId) ?? []).includes(tagId);
    setNoteTags((prev) => {
      const next = new Map(prev);
      const list = next.get(noteId) ?? [];
      next.set(noteId, has ? list.filter((t) => t !== tagId) : [...list, tagId]);
      return next;
    });
    const { error } = has
      ? await supabase.from("note_tags").delete().eq("note_id", noteId).eq("tag_id", tagId)
      : await supabase.from("note_tags").insert({ note_id: noteId, tag_id: tagId });
    if (error) setError(error.message);
  }

  /* Folders. */
  async function addFolder(parentId: string | null, name: string) {
    const trimmed = name.trim();
    setNewFolderIn(undefined);
    if (!trimmed) return;
    const siblings = childrenOf.get(parentId) ?? [];
    const { data, error } = await supabase
      .from("note_folders")
      .insert({ owner_id: meId, parent_id: parentId, name: trimmed, position: (siblings.length + 1) * 1000 })
      .select("id,owner_id,parent_id,name,emoji,color,position")
      .single();
    if (error || !data) {
      setError(error?.message ?? "Could not create the folder.");
      return;
    }
    setFolders((prev) => [...prev, data as FolderRow]);
    if (parentId) setExpanded((prev) => new Set(prev).add(parentId));
    setView({ kind: "folder", id: (data as FolderRow).id });
  }

  async function patchFolder(id: string, values: Partial<FolderRow>) {
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, ...values } : f)));
    const { error } = await supabase.from("note_folders").update(values).eq("id", id);
    if (error) {
      setError(error.message);
      void load();
    }
  }

  async function deleteFolder(f: FolderRow) {
    const ids = descendants(f.id);
    const inside = notes.filter((n) => n.folder_id && ids.has(n.folder_id)).length;
    const msg = inside
      ? `Delete the folder "${f.name}"${ids.size > 1 ? " and the folders inside it" : ""}? The ${inside} note${inside === 1 ? "" : "s"} inside move to All notes.`
      : `Delete the folder "${f.name}"?`;
    if (!window.confirm(msg)) return;
    if (view.kind === "folder" && ids.has(view.id)) setView({ kind: "all" });
    setFolders((prev) => prev.filter((x) => !ids.has(x.id)));
    const { error } = await supabase.from("note_folders").delete().eq("id", f.id);
    if (error) setError(error.message);
    void load();
  }

  function folderPath(id: string | null): string {
    const parts: string[] = [];
    let cur = folders.find((f) => f.id === id);
    while (cur) {
      parts.unshift(cur.name);
      const parentId: string | null = cur.parent_id;
      cur = folders.find((f) => f.id === parentId);
    }
    return parts.join(" / ");
  }

  const flatFolders = useMemo(() => {
    const out: { f: FolderRow; depth: number }[] = [];
    const walk = (parent: string | null, depth: number) => {
      for (const f of childrenOf.get(parent) ?? []) {
        out.push({ f, depth });
        walk(f.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [childrenOf]);

  const onEditorChange = useCallback(
    (json: JSONContent, text: string) => {
      const id = openIdRef.current;
      if (!id) return;
      pending.current = { id, json, text };
      setSave("saving");
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, text, updated_at: new Date().toISOString(), updated_by: meId } : n)));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 700);
    },
    [flush, meId]
  );

  /* Rendering. */
  const navItem = (active: boolean) =>
    `flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-current/10 ${active ? "nav-active font-medium" : ""}`;

  /* Called as a function (not a component) so inputs keep their state. */
  function renderTree(parent: string | null, depth: number): React.ReactNode {
    return (
      <ul>
        {(childrenOf.get(parent) ?? []).map((f) => {
          const kids = childrenOf.get(f.id) ?? [];
          const isOpen = expanded.has(f.id);
          const active = view.kind === "folder" && view.id === f.id;
          return (
            <li key={f.id}>
              <div className="group flex items-center" style={{ paddingLeft: depth * 12 }}>
                <button
                  type="button"
                  aria-label={isOpen ? `Collapse ${f.name}` : `Expand ${f.name}`}
                  onClick={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(f.id)) next.delete(f.id);
                      else next.add(f.id);
                      return next;
                    })
                  }
                  className={`flex size-5 shrink-0 items-center justify-center rounded text-xs opacity-50 hover:bg-current/10 ${kids.length ? "" : "invisible"}`}
                >
                  {isOpen ? "▾" : "▸"}
                </button>
                {renaming === f.id ? (
                  <input
                    autoFocus
                    defaultValue={f.name}
                    aria-label="Folder name"
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      setRenaming(null);
                      if (v && v !== f.name) void patchFolder(f.id, { name: v });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") setRenaming(null);
                    }}
                    className="min-w-0 flex-1 rounded border border-current/30 bg-transparent px-1.5 py-1 text-sm outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setView({ kind: "folder", id: f.id });
                      setPane("list");
                    }}
                    onDoubleClick={() => setRenaming(f.id)}
                    className={navItem(active)}
                  >
                    {f.emoji ? <span className="w-[15px] text-center text-sm leading-none">{f.emoji}</span> : <FolderGlyph color={f.color} />}
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    {counts.get(f.id) ? <span className="text-xs opacity-50">{counts.get(f.id)}</span> : null}
                  </button>
                )}
                <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-60">
                  <Menu label={`Actions for folder ${f.name}`}>
                    <MenuItem onClick={() => setNewFolderIn(f.id)}>New folder inside</MenuItem>
                    <MenuItem onClick={() => setRenaming(f.id)}>Rename</MenuItem>
                    <MenuItem
                      onClick={() => {
                        const e = window.prompt("Emoji for this folder (leave empty for none)", f.emoji ?? "");
                        if (e !== null) void patchFolder(f.id, { emoji: e.trim() ? e.trim().slice(0, 16) : null });
                      }}
                    >
                      Change icon
                    </MenuItem>
                    <MenuItem
                      onClick={() => {
                        const i = f.color ? FOLDER_COLORS.indexOf(f.color) : -1;
                        const next = i + 1 >= FOLDER_COLORS.length ? null : FOLDER_COLORS[i + 1];
                        void patchFolder(f.id, { color: next });
                      }}
                    >
                      Next color
                    </MenuItem>
                    <MenuItem onClick={() => void deleteFolder(f)} danger>
                      Delete folder
                    </MenuItem>
                  </Menu>
                </div>
              </div>
              {newFolderIn === f.id && (
                <div style={{ paddingLeft: (depth + 1) * 12 + 20 }} className="py-1 pr-2">
                  <input
                    autoFocus
                    placeholder="Folder name"
                    aria-label="New folder name"
                    onBlur={(e) => void addFolder(f.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") setNewFolderIn(undefined);
                    }}
                    className="w-full rounded border border-current/30 bg-transparent px-1.5 py-1 text-sm outline-none"
                  />
                </div>
              )}
              {isOpen && kids.length > 0 && renderTree(f.id, depth + 1)}
            </li>
          );
        })}
      </ul>
    );
  }

  const viewTitle =
    view.kind === "all"
      ? "All notes"
      : view.kind === "shared"
        ? "Shared"
        : view.kind === "archived"
          ? "Archived"
          : view.kind === "trash"
            ? "Recently deleted"
            : view.kind === "tag"
              ? tagById.get(view.id)?.name ?? "Tag"
              : folders.find((f) => f.id === view.id)?.name ?? "Folder";

  const editedBy = current?.updated_by ? (current.updated_by === meId ? "you" : profileById.get(current.updated_by)?.name ?? "someone") : null;
  const words = current ? wordCount(current.text) : 0;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col md:h-dvh">
      <div className={`shrink-0 ${pane === "note" ? "hidden md:block" : ""}`}>
        <PageCover page="notes" label="Notes" containerClassName="w-full px-4 md:px-6" />
        <div className="flex flex-wrap items-end justify-between gap-2 px-4 pb-3 pt-5 md:px-6">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">Notes</h1>
            <PageIntro page="notes" />
          </div>
          <button type="button" onClick={() => void createNote()} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white">
            New note
          </button>
        </div>
        {error && (
          <div role="alert" className="mx-4 mb-2 flex items-start justify-between gap-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm md:mx-6">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="shrink-0 underline">
              Dismiss
            </button>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 border-t border-current/10">
        {/* Folders */}
        <aside
          aria-label="Folders"
          className={`${pane === "folders" ? "flex" : "hidden"} w-full shrink-0 flex-col overflow-y-auto border-r border-current/10 p-2 lg:flex lg:w-56`}
        >
          {(
            [
              [{ kind: "all" }, "All notes"],
              [{ kind: "shared" }, "Shared"],
            ] as [View, string][]
          ).map(([v, label]) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                setView(v);
                setPane("list");
              }}
              className={navItem(sameView(view, v))}
            >
              <span className="w-[15px] text-center text-xs opacity-60">{v.kind === "all" ? "▤" : "⇄"}</span>
              {label}
            </button>
          ))}

          <div className="mt-4 flex items-center justify-between px-2">
            <p className="text-xs font-medium uppercase tracking-wide opacity-50">Folders</p>
            <button type="button" onClick={() => setNewFolderIn(null)} className="rounded px-1.5 text-sm opacity-60 hover:bg-current/10 hover:opacity-100" aria-label="New folder">
              +
            </button>
          </div>
          <div className="mt-1">
            {renderTree(null, 0)}
            {newFolderIn === null && (
              <div className="py-1 pl-6 pr-2">
                <input
                  autoFocus
                  placeholder="Folder name"
                  aria-label="New folder name"
                  onBlur={(e) => void addFolder(null, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setNewFolderIn(undefined);
                  }}
                  className="w-full rounded border border-current/30 bg-transparent px-1.5 py-1 text-sm outline-none"
                />
              </div>
            )}
            {folders.length === 0 && newFolderIn === undefined && <p className="px-2 py-1 text-xs opacity-50">No folders yet.</p>}
          </div>

          {usedTags.length > 0 && (
            <>
              <p className="mt-4 px-2 text-xs font-medium uppercase tracking-wide opacity-50">Tags</p>
              <div className="mt-1 space-y-0.5">
                {usedTags.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setView({ kind: "tag", id: t.id });
                      setPane("list");
                    }}
                    className={navItem(view.kind === "tag" && view.id === t.id)}
                  >
                    <ChipBadge chip={t} />
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="mt-auto space-y-0.5 border-t border-current/10 pt-2">
            {(
              [
                [{ kind: "archived" }, "Archived", "▣"],
                [{ kind: "trash" }, "Recently deleted", "🗑"],
              ] as [View, string, string][]
            ).map(([v, label, icon]) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setView(v);
                  setPane("list");
                }}
                className={navItem(sameView(view, v))}
              >
                <span className="w-[15px] text-center text-xs opacity-60">{icon}</span>
                {label}
              </button>
            ))}
          </div>
        </aside>

        {/* Note list */}
        <section
          aria-label="Note list"
          className={`${pane === "list" ? "flex" : "hidden"} w-full shrink-0 flex-col border-r border-current/10 md:flex md:w-72`}
        >
          <div className="space-y-2 border-b border-current/10 p-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPane("folders")}
                className="rounded-md border border-current/20 px-2 py-1 text-sm lg:hidden"
                aria-label="Show folders"
              >
                ☰
              </button>
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">{viewTitle}</p>
              <select
                aria-label="Sort notes"
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                className="rounded-md border border-current/20 bg-transparent px-1.5 py-1 text-xs outline-none"
              >
                <option value="edited">Last edited</option>
                <option value="created">Newest</option>
                <option value="title">Title</option>
              </select>
            </div>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes"
              aria-label="Search notes"
              className="w-full rounded-md border border-current/20 bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:opacity-50 focus:border-current/50"
            />
            {view.kind === "trash" && (
              <p className="text-xs opacity-60">Deleted notes stay here for {TRASH_DAYS} days, then they are gone for good.</p>
            )}
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {loading ? (
              <li className="p-3 text-sm opacity-60">Loading...</li>
            ) : listed.length === 0 ? (
              <li className="p-3 text-sm opacity-60">
                {query ? "Nothing matches." : view.kind === "trash" ? "Nothing deleted." : view.kind === "archived" ? "Nothing archived." : "No notes here yet."}
              </li>
            ) : (
              listed.map((n) => {
                const active = open?.id === n.id;
                const pinned = prefs.get(n.id)?.pinned;
                const owner = n.owner_id !== meId ? profileById.get(n.owner_id) : null;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => select(n.id)}
                      className={`w-full rounded-md px-2.5 py-2 text-left hover:bg-current/5 ${active ? "bg-accent/12 ring-1 ring-accent/30" : ""}`}
                    >
                      <span className="flex items-center gap-1.5">
                        {(n.emoji || n.image_url) && <ProjectImage name="" emoji={n.emoji} imageUrl={n.image_url} size={16} />}
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{displayTitle(n)}</span>
                        {pinned && <span aria-label="Pinned" className="text-xs opacity-60">📌</span>}
                        {n.visibility === "shared" && <span aria-label="Shared" title="Shared" className="text-xs opacity-60">⇄</span>}
                      </span>
                      <span className="mt-0.5 flex gap-2 text-xs">
                        <span className="shrink-0 opacity-60">{relativeTime(n.deleted_at ?? n.updated_at)}</span>
                        <span className="min-w-0 truncate opacity-50">{snippet(n) || "No more text"}</span>
                      </span>
                      {(owner || (noteTags.get(n.id) ?? []).length > 0) && (
                        <span className="mt-1 flex flex-wrap items-center gap-1 text-xs opacity-80">
                          {owner && <span className="opacity-60">From {owner.name}</span>}
                          {(noteTags.get(n.id) ?? []).slice(0, 3).map((id) => {
                            const t = tagById.get(id);
                            return t ? <ChipBadge key={id} chip={t} /> : null;
                          })}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </section>

        {/* Editor */}
        <section aria-label="Note" className={`${pane === "note" ? "flex" : "hidden"} min-w-0 flex-1 flex-col md:flex`}>
          {!open || !current ? (
            <div className="flex flex-1 items-center justify-center p-6 text-sm opacity-60">
              {loading ? "Loading..." : "Pick a note, or press New note."}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <div className="flex flex-wrap items-center gap-2 border-b border-current/10 px-3 py-2">
                <button type="button" onClick={() => select(null)} className="rounded-md border border-current/20 px-2 py-1 text-sm md:hidden">
                  {"← Notes"}
                </button>
                <span className="min-w-0 flex-1 truncate text-xs opacity-60">
                  {current.deleted_at
                    ? "In Recently deleted"
                    : current.owner_id === meId
                      ? current.folder_id
                        ? folderPath(current.folder_id)
                        : "No folder"
                      : `Shared by ${profileById.get(current.owner_id)?.name ?? "someone"}`}
                  {editedBy && ` · Edited ${relativeTime(current.updated_at)} by ${editedBy}`}
                </span>
                <span className="text-xs opacity-60" aria-live="polite">
                  {save === "saving" ? "Saving..." : save === "error" ? "Not saved" : "Saved"}
                </span>
                {mine && !current.deleted_at && (
                  <div role="radiogroup" aria-label="Who can see this note" className="flex overflow-hidden rounded-md border border-current/20 text-xs">
                    {(
                      [
                        ["private", "Only me"],
                        ["shared", "Shared"],
                      ] as const
                    ).map(([v, label]) => (
                      <button
                        key={v}
                        type="button"
                        role="radio"
                        aria-checked={current.visibility === v}
                        onClick={() => {
                          if (v === current.visibility) return;
                          if (v === "shared" && !window.confirm("Share this note? The other person can read and edit it.")) return;
                          void patchNote(current.id, { visibility: v });
                        }}
                        className={`px-2 py-1 ${current.visibility === v ? "bg-accent/15 font-medium" : "opacity-70 hover:bg-current/10"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                {current.deleted_at ? (
                  <>
                    <button type="button" onClick={() => void patchNote(current.id, { deleted_at: null })} className="rounded-md border border-current/20 px-2.5 py-1 text-sm">
                      Restore
                    </button>
                    <button type="button" onClick={() => void deleteForever(current)} className="rounded-md px-2.5 py-1 text-sm text-red-500 underline">
                      Delete forever
                    </button>
                  </>
                ) : (
                  <Menu label="Note actions">
                    <MenuItem onClick={() => void setPinned(current.id, !prefs.get(current.id)?.pinned)}>
                      {prefs.get(current.id)?.pinned ? "Unpin" : "Pin to the top"}
                    </MenuItem>
                    <MenuItem
                      onClick={() => {
                        void navigator.clipboard?.writeText(`${window.location.origin}/notes?note=${current.id}`);
                      }}
                    >
                      Copy link to this note
                    </MenuItem>
                    {mine && (
                      <MenuItem onClick={() => void patchNote(current.id, { archived: !current.archived })}>
                        {current.archived ? "Unarchive" : "Archive"}
                      </MenuItem>
                    )}
                    {mine && (
                      <MenuItem onClick={() => void trash(current)} danger>
                        Delete
                      </MenuItem>
                    )}
                  </Menu>
                )}
              </div>

              <div className="mx-auto w-full max-w-3xl">
                <div className="flex items-start gap-2 px-5 pt-5">
                  <ImagePicker
                    name={displayTitle(current)}
                    value={{ imageUrl: current.image_url, emoji: current.emoji }}
                    folder={`notes/${meId}`}
                    resetLabel="No icon"
                    size={30}
                    trigger={
                      current.emoji || current.image_url ? (
                        <ProjectImage name="" emoji={current.emoji} imageUrl={current.image_url} size={34} />
                      ) : (
                        <span className="flex size-[34px] items-center justify-center rounded-md text-sm opacity-30 hover:opacity-70">☺</span>
                      )
                    }
                    buttonClassName="mt-0.5 rounded-md hover:bg-current/10"
                    onChange={(next) => {
                      if (!mine) return;
                      void patchNote(current.id, { emoji: next.emoji, image_url: next.imageUrl });
                    }}
                  />
                  <input
                    id="note-title"
                    key={current.id}
                    defaultValue={current.title}
                    placeholder="Title"
                    aria-label="Note title"
                    disabled={Boolean(current.deleted_at)}
                    onChange={(e) => {
                      const v = e.target.value;
                      setNotes((prev) => prev.map((n) => (n.id === current.id ? { ...n, title: v } : n)));
                    }}
                    onBlur={(e) => {
                      const v = e.target.value.trim().slice(0, 300);
                      void supabase.from("notes").update({ title: v }).eq("id", current.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        (e.target as HTMLInputElement).blur();
                        document.querySelector<HTMLElement>(".note-content")?.focus();
                      }
                    }}
                    className="min-w-0 flex-1 bg-transparent text-2xl font-bold tracking-tight outline-none placeholder:opacity-30"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 px-5 pb-1 pt-2">
                  <ChipPicker
                    label="Tags"
                    options={tags}
                    selected={noteTags.get(current.id) ?? []}
                    onToggle={(id) => void toggleTag(current.id, id)}
                    onCreate={async (name) => {
                      const t = await createTag(name);
                      if (t) await toggleTag(current.id, t.id);
                    }}
                    createLabel="Create tag"
                    emptyLabel="Add tags"
                  />
                  {mine && !current.deleted_at && (
                    <Popover label="Move to a folder" trigger={current.folder_id ? `In ${folders.find((f) => f.id === current.folder_id)?.name ?? "folder"}` : "Move to folder"} buttonClassName="rounded-md px-2 py-0.5 text-xs opacity-70 hover:bg-current/10 hover:opacity-100" width={240}>
                      {(close) => (
                        <div className="space-y-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              void patchNote(current.id, { folder_id: null });
                              close();
                            }}
                            className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-current/10"
                          >
                            No folder
                          </button>
                          {flatFolders.map(({ f, depth }) => (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => {
                                void patchNote(current.id, { folder_id: f.id });
                                close();
                              }}
                              style={{ paddingLeft: 8 + depth * 14 }}
                              className={`flex w-full items-center gap-2 rounded py-1.5 pr-2 text-left text-sm hover:bg-current/10 ${current.folder_id === f.id ? "font-medium" : ""}`}
                            >
                              {f.emoji ?? <FolderGlyph color={f.color} />}
                              <span className="truncate">{f.name}</span>
                            </button>
                          ))}
                          {folders.length === 0 && <p className="px-2 py-1 text-xs opacity-60">Make a folder with + in the folder list.</p>}
                        </div>
                      )}
                    </Popover>
                  )}
                  <span className="ml-auto text-xs opacity-50">
                    {words} {words === 1 ? "word" : "words"} · {Math.max(1, Math.round(words / 220))} min read
                  </span>
                </div>
                {incoming && (
                  <div className="mx-5 mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
                    <span>The other person just changed this note while you were typing.</span>
                    <span className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          pending.current = null;
                          setOpen((prev) => (prev ? { ...prev, content: incoming, version: prev.version + 1 } : prev));
                          setIncoming(null);
                          setSave("saved");
                        }}
                        className="underline"
                      >
                        Load their version
                      </button>
                      <button type="button" onClick={() => setIncoming(null)} className="underline opacity-70">
                        Keep mine
                      </button>
                    </span>
                  </div>
                )}
                <NoteEditor
                  key={open.id}
                  noteId={open.id}
                  content={open.content}
                  contentVersion={open.version}
                  editable={!current.deleted_at}
                  onChange={onEditorChange}
                />
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
