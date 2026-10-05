"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { createClient } from "@/lib/supabase/client";
import {
  KIND_LABELS,
  findGoogleLinks,
  parseGoogleFile,
  type LinkKind,
  type LinkOpen,
} from "@/lib/google";
import {
  LINK_COLUMNS,
  TAG_PALETTE,
  type LinkPref,
  type LinkRow,
} from "@/lib/links";
import {
  DEFAULT_LINK_VIEW,
  type LinkGroup,
  type LinkSort,
  type LinkViewPrefs,
} from "@/lib/personal";
import { pickDriveFiles, pickerAvailable } from "@/lib/drivePicker";
import { PROFILE_COLUMNS, type Profile, type Tag } from "@/lib/types";
import PageIntro from "./PageIntro";
import PageCover from "./PageCover";
import Popover from "./Popover";
import ChipPicker, { ChipBadge } from "./ChipPicker";
import { usePersonal } from "./PersonalProvider";
import LinkForm, { type LinkDetails, type LinkEntry } from "./links/LinkForm";
import LinkIcon from "./links/LinkIcon";
import { LinkCard, LinkRowItem, otherPageLabel, type ItemActions } from "./links/LinkItem";

type Group = { id: string; label: string; items: LinkRow[] };

const selectClass =
  "rounded-md border border-current/20 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-current/50";
const barButton = "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm hover:bg-current/10";

export default function LinksPage({
  kind,
  meId,
  linkOpen,
}: {
  kind: LinkKind;
  meId: string;
  linkOpen: LinkOpen;
}) {
  const supabase = useMemo(() => createClient(), []);
  const labels = KIND_LABELS[kind];
  const pageKey = kind === "doc" ? "docs" : "sheets";
  const { personal, update } = usePersonal();
  const viewPrefs: LinkViewPrefs = personal.links?.[kind] ?? DEFAULT_LINK_VIEW;

  const [links, setLinks] = useState<LinkRow[]>([]);
  const [prefs, setPrefs] = useState<Map<string, LinkPref>>(new Map());
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [linkTags, setLinkTags] = useState<Map<string, string[]>>(new Map());
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const lastClicked = useRef<string | null>(null);
  const [viewing, setViewing] = useState<LinkRow | null>(null);
  const [form, setForm] = useState<
    { mode: "add"; text: string } | { mode: "edit"; link: LinkRow } | null
  >(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const load = useCallback(async () => {
    const [l, p, pr, t, lt, pj] = await Promise.all([
      supabase.from("google_links").select(LINK_COLUMNS).eq("kind", kind).order("created_at"),
      supabase.from("google_link_prefs").select("link_id,position,pinned,last_opened_at"),
      supabase.from("profiles").select(PROFILE_COLUMNS),
      supabase.from("tags").select("id,name,color").order("name"),
      supabase.from("link_tags").select("link_id,tag_id"),
      supabase.from("projects").select("id,name,archived").order("name"),
    ]);
    const err = l.error ?? p.error ?? pr.error ?? t.error ?? lt.error ?? pj.error;
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    setLinks((l.data ?? []) as LinkRow[]);
    setPrefs(
      new Map(
        ((p.data ?? []) as ({ link_id: string } & LinkPref)[]).map((r) => [
          r.link_id,
          { position: r.position, pinned: r.pinned, last_opened_at: r.last_opened_at },
        ])
      )
    );
    setProfiles((pr.data ?? []) as Profile[]);
    setTags((t.data ?? []) as Tag[]);
    const byLink = new Map<string, string[]>();
    for (const r of (lt.data ?? []) as { link_id: string; tag_id: string }[]) {
      byLink.set(r.link_id, [...(byLink.get(r.link_id) ?? []), r.tag_id]);
    }
    setLinkTags(byLink);
    setProjects(
      ((pj.data ?? []) as { id: string; name: string; archived: boolean }[])
        .filter((x) => !x.archived)
        .map(({ id, name }) => ({ id, name }))
    );
    setLoading(false);
  }, [supabase, kind]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel(`links-${kind}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "google_links" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "link_tags" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "tags" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, kind, load]);

  /* Paste a Google link anywhere on the page (outside a text box) to add it. */
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (form || viewing) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.closest("input, textarea, select, [contenteditable=true]") || el.isContentEditable)) return;
      const text = e.clipboardData?.getData("text") ?? "";
      const found = findGoogleLinks(text);
      if (found.length === 0) return;
      e.preventDefault();
      setForm({ mode: "add", text: found.join("\n") });
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [form, viewing]);

  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const sections = useMemo(
    () =>
      Array.from(new Set(links.map((l) => l.section).filter((s): s is string => Boolean(s)))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [links]
  );

  /* Filtering and sorting. */
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    return links.filter((l) => {
      if (l.archived !== showArchived) return false;
      if (q) {
        const hay = `${l.title} ${l.note ?? ""} ${l.section ?? ""} ${(linkTags.get(l.id) ?? [])
          .map((id) => tagById.get(id)?.name ?? "")
          .join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (tagFilter.length > 0) {
        const has = linkTags.get(l.id) ?? [];
        if (!tagFilter.every((t) => has.includes(t))) return false;
      }
      return true;
    });
  }, [links, showArchived, q, tagFilter, linkTags, tagById]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const sort: LinkSort = viewPrefs.sort;
    const pos = (l: LinkRow) => prefs.get(l.id)?.position ?? Number.MAX_SAFE_INTEGER;
    list.sort((a, b) => {
      switch (sort) {
        case "name":
          return a.title.localeCompare(b.title);
        case "added":
          return b.created_at.localeCompare(a.created_at);
        case "opened":
          return (prefs.get(b.id)?.last_opened_at ?? "").localeCompare(prefs.get(a.id)?.last_opened_at ?? "");
        case "review":
          return (a.review_on ?? "9999").localeCompare(b.review_on ?? "9999");
        default:
          return pos(a) - pos(b) || a.created_at.localeCompare(b.created_at);
      }
    });
    return list;
  }, [filtered, prefs, viewPrefs.sort]);

  const pinned = useMemo(() => sorted.filter((l) => prefs.get(l.id)?.pinned), [sorted, prefs]);
  const rest = useMemo(() => sorted.filter((l) => !prefs.get(l.id)?.pinned), [sorted, prefs]);

  const groups: Group[] = useMemo(() => {
    const g: LinkGroup = viewPrefs.group;
    if (g === "section") {
      if (!rest.some((l) => l.section)) return [{ id: "all", label: "", items: rest }];
      const map = new Map<string, LinkRow[]>();
      for (const l of rest) {
        const key = l.section ?? "";
        map.set(key, [...(map.get(key) ?? []), l]);
      }
      return Array.from(map.entries())
        .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)))
        .map(([key, items]) => ({ id: `s:${key}`, label: key || "No section", items }));
    }
    if (g === "tag") {
      const map = new Map<string, LinkRow[]>();
      const none: LinkRow[] = [];
      for (const l of rest) {
        const ids = linkTags.get(l.id) ?? [];
        if (ids.length === 0) none.push(l);
        for (const id of ids) map.set(id, [...(map.get(id) ?? []), l]);
      }
      const out = Array.from(map.entries())
        .map(([id, items]) => ({ id: `t:${id}`, label: tagById.get(id)?.name ?? "Tag", items }))
        .sort((a, b) => a.label.localeCompare(b.label));
      if (none.length) out.push({ id: "t:none", label: "No tag", items: none });
      return out;
    }
    if (g === "person") {
      const map = new Map<string, LinkRow[]>();
      for (const l of rest) map.set(l.created_by, [...(map.get(l.created_by) ?? []), l]);
      return Array.from(map.entries()).map(([id, items]) => ({
        id: `p:${id}`,
        label: id === meId ? "Added by you" : `Added by ${profileById.get(id)?.name ?? "someone"}`,
        items,
      }));
    }
    return [{ id: "all", label: "", items: rest }];
  }, [rest, viewPrefs.group, linkTags, tagById, profileById, meId]);

  const recent = useMemo(
    () =>
      links
        .filter((l) => !l.archived && prefs.get(l.id)?.last_opened_at)
        .sort((a, b) =>
          (prefs.get(b.id)?.last_opened_at ?? "").localeCompare(prefs.get(a.id)?.last_opened_at ?? "")
        )
        .slice(0, 6),
    [links, prefs]
  );

  const visibleOrder = useMemo(() => [...pinned, ...groups.flatMap((g) => g.items)], [pinned, groups]);
  const canDrag = viewPrefs.sort === "custom" && viewPrefs.group !== "tag" && !q && tagFilter.length === 0 && viewPrefs.view === "list";

  /* Saving. */
  function savePrefsView(patch: Partial<LinkViewPrefs>) {
    void update((p) => ({
      ...p,
      links: { ...(p.links ?? { doc: DEFAULT_LINK_VIEW, sheet: DEFAULT_LINK_VIEW }), [kind]: { ...viewPrefs, ...patch } },
    }));
  }

  function nextPosition(): number {
    let max = 0;
    for (const p of prefs.values()) max = Math.max(max, p.position);
    return max + 1000;
  }

  async function upsertPref(id: string, patch: Partial<LinkPref>) {
    const current = prefs.get(id) ?? { position: nextPosition(), pinned: false, last_opened_at: null };
    const next = { ...current, ...patch };
    setPrefs((prev) => new Map(prev).set(id, next));
    const { error } = await supabase
      .from("google_link_prefs")
      .upsert({ user_id: meId, link_id: id, ...next }, { onConflict: "user_id,link_id" });
    if (error) setError(error.message);
  }

  async function patch(id: string, values: Partial<LinkRow>) {
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, ...values } : l)));
    const { error } = await supabase.from("google_links").update(values).eq("id", id);
    if (error) {
      setError(error.message);
      load();
      return false;
    }
    return true;
  }

  async function setTagsFor(ids: string[], add: string[], remove: string[]) {
    if (add.length) {
      const rows = ids.flatMap((link_id) => add.map((tag_id) => ({ link_id, tag_id })));
      const { error } = await supabase.from("link_tags").upsert(rows, { onConflict: "link_id,tag_id", ignoreDuplicates: true });
      if (error) return error.message;
    }
    if (remove.length) {
      const { error } = await supabase.from("link_tags").delete().in("link_id", ids).in("tag_id", remove);
      if (error) return error.message;
    }
    return null;
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

  async function addEntries(entries: LinkEntry[], d: LinkDetails): Promise<string | null> {
    const rows = entries.map((e) => ({
      kind: e.kind,
      title: e.title,
      url: e.url,
      visibility: d.visibility,
      created_by: meId,
      emoji: entries.length === 1 ? d.emoji : null,
      image_url: entries.length === 1 ? d.image_url : null,
      note: d.note,
      color: d.color,
      section: d.section,
      project_id: d.project_id,
      task_id: d.task_id,
      review_on: d.review_on,
    }));
    const { data, error } = await supabase.from("google_links").insert(rows).select("id,kind");
    if (error) return error.message;
    const ids = ((data ?? []) as { id: string; kind: LinkKind }[]).map((r) => r.id);
    if (d.tagIds.length) {
      const err = await setTagsFor(ids, d.tagIds, []);
      if (err) return err;
    }
    const elsewhere = entries.filter((e) => e.kind !== kind).length;
    if (elsewhere > 0) {
      setNotice(
        elsewhere === entries.length
          ? `Added to ${KIND_LABELS[entries[0].kind].plural}, because of the file type.`
          : `${elsewhere} went to ${otherPageLabel(kind)}, because of the file type.`
      );
    }
    load();
    return null;
  }

  async function saveEdit(link: LinkRow, values: { title: string } & LinkDetails): Promise<string | null> {
    const mine = link.created_by === meId;
    if (mine) {
      const { tagIds: _ignored, ...rest } = values;
      void _ignored;
      const ok = await patch(link.id, rest);
      if (!ok) return "Could not save.";
      if (link.image_url && link.image_url !== values.image_url) {
        const { removeIcon } = await import("@/lib/imageUpload");
        await removeIcon(link.image_url);
      }
    }
    const before = linkTags.get(link.id) ?? [];
    const err = await setTagsFor(
      [link.id],
      values.tagIds.filter((t) => !before.includes(t)),
      before.filter((t) => !values.tagIds.includes(t))
    );
    load();
    return err;
  }

  function open(link: LinkRow, viaGoogle: boolean) {
    void upsertPref(link.id, { last_opened_at: new Date().toISOString() });
    const file = parseGoogleFile(link.url);
    if (viaGoogle || linkOpen === "google" || !file) {
      window.open(file?.url ?? link.url, "_blank", "noopener,noreferrer");
    } else {
      setViewing(link);
    }
  }

  async function duplicate(link: LinkRow) {
    const { id: _id, created_at: _c, ...rest } = link;
    void _id;
    void _c;
    const { data, error } = await supabase
      .from("google_links")
      .insert({ ...rest, title: `${link.title} (copy)`, created_by: meId, image_url: null })
      .select("id")
      .single();
    if (error || !data) {
      setError(error?.message ?? "Could not duplicate.");
      return;
    }
    const t = linkTags.get(link.id) ?? [];
    if (t.length) await setTagsFor([data.id as string], t, []);
    load();
  }

  async function moveToOtherPage(ids: string[]) {
    const other: LinkKind = kind === "doc" ? "sheet" : "doc";
    setLinks((prev) => prev.filter((l) => !ids.includes(l.id)));
    const { error } = await supabase.from("google_links").update({ kind: other }).in("id", ids);
    if (error) setError(error.message);
    else setNotice(`Moved to ${otherPageLabel(kind)}.`);
    load();
  }

  async function remove(link: LinkRow) {
    if (!window.confirm(`Delete "${link.title}" from Jefi Records? The file in Google is not touched.`)) return;
    setLinks((prev) => prev.filter((l) => l.id !== link.id));
    const { error } = await supabase.from("google_links").delete().eq("id", link.id);
    if (error) {
      setError(error.message);
      load();
    } else if (link.image_url) {
      const { removeIcon } = await import("@/lib/imageUpload");
      await removeIcon(link.image_url);
    }
  }

  function toggleSelect(id: string, shift: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shift && lastClicked.current) {
        const a = visibleOrder.findIndex((l) => l.id === lastClicked.current);
        const b = visibleOrder.findIndex((l) => l.id === id);
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          for (let i = lo; i <= hi; i++) next.add(visibleOrder[i].id);
          lastClicked.current = id;
          return next;
        }
      }
      if (next.has(id)) next.delete(id);
      else next.add(id);
      lastClicked.current = id;
      return next;
    });
  }

  async function onDragEnd(e: DragEndEvent, list: LinkRow[]) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = list.findIndex((l) => l.id === active.id);
    const to = list.findIndex((l) => l.id === over.id);
    if (from < 0 || to < 0) return;
    const moved = [...list];
    const [item] = moved.splice(from, 1);
    moved.splice(to, 0, item);
    /* Renumber the whole visible order so groups keep their places. */
    const full = visibleOrder.filter((l) => !moved.some((m) => m.id === l.id));
    const firstIndex = visibleOrder.findIndex((l) => l.id === list[0].id);
    full.splice(Math.max(0, firstIndex), 0, ...moved);
    const next = new Map(prefs);
    full.forEach((l, i) => {
      const cur = next.get(l.id) ?? { position: 0, pinned: false, last_opened_at: null };
      next.set(l.id, { ...cur, position: (i + 1) * 1000 });
    });
    setPrefs(next);
    const { error } = await supabase.from("google_link_prefs").upsert(
      full.map((l) => ({ user_id: meId, link_id: l.id, ...next.get(l.id)! })),
      { onConflict: "user_id,link_id" }
    );
    if (error) {
      setError(error.message);
      load();
    }
  }

  async function browseDrive() {
    setError(null);
    try {
      const picked = await pickDriveFiles(kind);
      if (picked.length === 0) return;
      const entries: LinkEntry[] = [];
      for (const f of picked) {
        const file = parseGoogleFile(f.url);
        if (!file) continue;
        entries.push({
          url: file.url,
          title: f.name || labels.untitled,
          type: file.type,
          kind: file.type === "doc" ? "doc" : file.type === "sheet" ? "sheet" : kind,
        });
      }
      if (entries.length === 0) {
        setError("Those files cannot be added here.");
        return;
      }
      const err = await addEntries(entries, {
        visibility: "public",
        emoji: null,
        image_url: null,
        note: null,
        color: null,
        section: null,
        project_id: null,
        task_id: null,
        review_on: null,
        tagIds: [],
      });
      if (err) setError(err);
      else if (!notice) setNotice(`Added ${entries.length} from Google Drive.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google Drive could not open.");
    }
  }

  const selectedLinks = links.filter((l) => selected.has(l.id));
  const selectedMine = selectedLinks.filter((l) => l.created_by === meId);

  if (viewing) {
    const file = parseGoogleFile(viewing.url);
    return (
      <div className="flex h-[calc(100vh-3.5rem)] flex-col px-4 py-4 md:h-screen md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setViewing(null)}
            className="rounded-md border border-current/20 px-3 py-1.5 text-sm hover:border-current/50"
          >
            {"← "}
            {labels.plural}
          </button>
          <LinkIcon url={viewing.url} imageUrl={viewing.image_url} emoji={viewing.emoji} size={22} />
          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{viewing.title}</h1>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(file?.url ?? viewing.url);
              setNotice("Link copied.");
            }}
            className="rounded-md border border-current/20 px-3 py-1.5 text-sm hover:border-current/50"
          >
            Copy link
          </button>
          <a
            href={file?.url ?? viewing.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white"
          >
            Open in Google
          </a>
        </div>
        <p className="mt-2 text-xs opacity-60">
          If the file stays blank here, Google is asking you to sign in or is blocking the embed. Use Open in Google, which
          always works.
        </p>
        {file ? (
          <iframe
            key={viewing.id}
            src={file.embedUrl}
            title={viewing.title}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
            referrerPolicy="no-referrer-when-downgrade"
            className="mt-3 w-full flex-1 rounded-md border border-current/20 bg-white"
          />
        ) : (
          <p className="mt-4 text-sm">This link cannot be shown here. Use Open in Google.</p>
        )}
      </div>
    );
  }

  const actionsFor = (l: LinkRow): ItemActions => ({
    open: (viaGoogle) => open(l, viaGoogle),
    copy: () => {
      void navigator.clipboard?.writeText(parseGoogleFile(l.url)?.url ?? l.url);
      setNotice("Link copied.");
    },
    togglePin: () => void upsertPref(l.id, { pinned: !prefs.get(l.id)?.pinned }),
    edit: () => setForm({ mode: "edit", link: l }),
    duplicate: () => void duplicate(l),
    move: () => void moveToOtherPage([l.id]),
    toggleArchive: () => void patch(l.id, { archived: !l.archived }),
    remove: () => void remove(l),
    toggleSelect: (shift) => toggleSelect(l.id, shift),
  });

  const selecting = selected.size > 0;
  const otherPage = otherPageLabel(kind);

  function renderItems(items: LinkRow[]) {
    const props = (l: LinkRow) => ({
      link: l,
      pref: prefs.get(l.id),
      owner: profileById.get(l.created_by),
      mine: l.created_by === meId,
      tags: (linkTags.get(l.id) ?? []).map((id) => tagById.get(id)).filter((t): t is Tag => Boolean(t)),
      projectName: l.project_id ? projectById.get(l.project_id) : undefined,
      selected: selected.has(l.id),
      selecting,
      draggable: canDrag,
      otherPage,
      actions: actionsFor(l),
    });
    if (viewPrefs.view === "gallery") {
      return (
        <ul className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((l) => (
            <LinkCard key={l.id} {...props(l)} />
          ))}
        </ul>
      );
    }
    return (
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void onDragEnd(e, items)}>
        <SortableContext items={items.map((l) => l.id)} strategy={verticalListSortingStrategy}>
          <ul className="mt-1 border-t border-current/10">
            {items.map((l) => (
              <LinkRowItem key={l.id} {...props(l)} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    );
  }

  const nothing = !loading && pinned.length === 0 && rest.length === 0;

  return (
    <div className={selecting ? "pb-24" : ""}>
      <PageCover page={pageKey} label={labels.plural} containerClassName="mx-auto w-full max-w-5xl px-4 md:px-6" />
      <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="px-1.5 py-1 text-2xl font-semibold tracking-tight">{labels.plural}</h1>
            <div className="px-1.5">
              <PageIntro page={pageKey} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {pickerAvailable && (
              <button
                type="button"
                onClick={() => void browseDrive()}
                className="rounded-md border border-current/20 px-3 py-2 text-sm hover:border-current/50"
              >
                Browse Google Drive
              </button>
            )}
            <button
              type="button"
              onClick={() => setForm({ mode: "add", text: "" })}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white"
            >
              Add {labels.singular.replace("Google ", "")}
            </button>
          </div>
        </div>
        <p className="mt-1 px-1.5 text-xs opacity-50">Tip: paste a Google link anywhere on this page to add it.</p>

        {notice && (
          <div role="status" className="mt-3 flex items-start justify-between gap-3 rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-sm">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)} className="shrink-0 underline">
              OK
            </button>
          </div>
        )}
        {error && (
          <div role="alert" className="mt-3 flex items-start justify-between gap-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="shrink-0 underline">
              Dismiss
            </button>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${labels.plural.toLowerCase()}`}
            aria-label={`Search ${labels.plural.toLowerCase()}`}
            className="min-w-0 flex-1 basis-48 rounded-md border border-current/20 bg-transparent px-3 py-1.5 text-sm outline-none placeholder:opacity-50 focus:border-current/50"
          />
          <ChipPicker
            label="Filter by tag"
            options={tags}
            selected={tagFilter}
            onToggle={(id) => setTagFilter((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))}
            emptyLabel="All tags"
          />
          <div role="radiogroup" aria-label="Layout" className="flex overflow-hidden rounded-md border border-current/20 text-sm">
            {(["list", "gallery"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={viewPrefs.view === v}
                onClick={() => savePrefsView({ view: v })}
                className={`px-3 py-1.5 ${viewPrefs.view === v ? "bg-accent/15 font-medium" : "opacity-70 hover:bg-current/10"}`}
              >
                {v === "list" ? "List" : "Gallery"}
              </button>
            ))}
          </div>
          <label className="sr-only" htmlFor={`sort-${kind}`}>
            Sort
          </label>
          <select
            id={`sort-${kind}`}
            value={viewPrefs.sort}
            onChange={(e) => savePrefsView({ sort: e.target.value as LinkSort })}
            className={selectClass}
          >
            <option value="custom">My order</option>
            <option value="name">Name</option>
            <option value="added">Newest first</option>
            <option value="opened">Recently opened</option>
            <option value="review">Review date</option>
          </select>
          <label className="sr-only" htmlFor={`group-${kind}`}>
            Group
          </label>
          <select
            id={`group-${kind}`}
            value={viewPrefs.group}
            onChange={(e) => savePrefsView({ group: e.target.value as LinkGroup })}
            className={selectClass}
          >
            <option value="section">Group by section</option>
            <option value="tag">Group by tag</option>
            <option value="person">Group by who added</option>
            <option value="none">No groups</option>
          </select>
          <label className="flex cursor-pointer items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => {
                setShowArchived(e.target.checked);
                setSelected(new Set());
              }}
              className="accent-[var(--accent)]"
            />
            Archived
          </label>
        </div>

        {!showArchived && !q && tagFilter.length === 0 && recent.length > 0 && (
          <section className="mt-6" aria-label="Recently opened">
            <h2 className="px-1.5 text-xs font-medium uppercase tracking-wide opacity-50">Recently opened</h2>
            <ul className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {recent.map((l) => (
                <li key={l.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => open(l, false)}
                    className="flex w-44 items-center gap-2 rounded-md border border-current/15 px-2.5 py-2 text-left text-sm hover:border-current/40"
                  >
                    <LinkIcon url={l.url} imageUrl={l.image_url} emoji={l.emoji} size={20} />
                    <span className="truncate">{l.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {loading ? (
          <p className="mt-6 text-sm opacity-60">Loading...</p>
        ) : nothing ? (
          <p className="mt-8 text-sm opacity-60">
            {showArchived
              ? "Nothing is archived."
              : q || tagFilter.length
                ? "Nothing matches."
                : `No ${labels.plural.toLowerCase()} yet. Press Add, or paste a link anywhere on this page.`}
          </p>
        ) : (
          <>
            {pinned.length > 0 && (
              <section className="mt-6">
                <h2 className="px-1.5 text-xs font-medium uppercase tracking-wide opacity-50">Pinned</h2>
                {renderItems(pinned)}
              </section>
            )}
            {groups.map((g) =>
              g.items.length === 0 ? null : (
                <section key={g.id} className="mt-6">
                  {g.label && (
                    <h2 className="flex items-center gap-2 px-1.5 text-xs font-medium uppercase tracking-wide opacity-60">
                      {g.id.startsWith("t:") && tagById.get(g.id.slice(2)) ? (
                        <ChipBadge chip={tagById.get(g.id.slice(2))!} />
                      ) : (
                        g.label
                      )}
                      <span className="font-normal opacity-60">{g.items.length}</span>
                    </h2>
                  )}
                  {renderItems(g.items)}
                </section>
              )
            )}
          </>
        )}
      </div>

      {selecting && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-current/20 bg-background p-1.5 shadow-xl">
            <span className="px-2 text-sm font-medium">{selected.size} selected</span>
            <Popover label="Add or remove tags" trigger="Tags" buttonClassName={barButton} width={260}>
              {() => (
                <div className="space-y-1">
                  <p className="px-1 pb-1 text-xs opacity-60">Click a tag to add it to all selected. Click again to remove it.</p>
                  {tags.map((t) => {
                    const all = selectedLinks.every((l) => (linkTags.get(l.id) ?? []).includes(t.id));
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={async () => {
                          const err = await setTagsFor(
                            [...selected],
                            all ? [] : [t.id],
                            all ? [t.id] : []
                          );
                          if (err) setError(err);
                          load();
                        }}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-current/10"
                      >
                        <span className="w-4 text-center">{all ? "✓" : ""}</span>
                        <ChipBadge chip={t} />
                      </button>
                    );
                  })}
                  {tags.length === 0 && <p className="px-2 text-sm opacity-60">No tags yet. Create one from an item&apos;s Edit details.</p>}
                </div>
              )}
            </Popover>
            {selectedMine.length > 0 && (
              <Popover label="Move to a section" trigger="Section" buttonClassName={barButton} width={240}>
                {(close) => (
                  <form
                    className="space-y-2"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const value = String(new FormData(e.currentTarget).get("section") ?? "").trim() || null;
                      const ids = selectedMine.map((l) => l.id);
                      setLinks((prev) => prev.map((l) => (ids.includes(l.id) ? { ...l, section: value } : l)));
                      const { error } = await supabase.from("google_links").update({ section: value }).in("id", ids);
                      if (error) setError(error.message);
                      close();
                    }}
                  >
                    <input
                      name="section"
                      list="bulk-sections"
                      autoFocus
                      placeholder="Section name, or empty for none"
                      className="w-full rounded-md border border-current/20 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-current/50"
                    />
                    <datalist id="bulk-sections">
                      {sections.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                    <button type="submit" className="w-full rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white">
                      Move
                    </button>
                    {selectedMine.length < selected.size && (
                      <p className="text-xs opacity-60">Only the items you added will move.</p>
                    )}
                  </form>
                )}
              </Popover>
            )}
            <button
              type="button"
              className={barButton}
              onClick={async () => {
                const allPinned = selectedLinks.every((l) => prefs.get(l.id)?.pinned);
                for (const l of selectedLinks) await upsertPref(l.id, { pinned: !allPinned });
              }}
            >
              {selectedLinks.every((l) => prefs.get(l.id)?.pinned) ? "Unpin" : "Pin"}
            </button>
            {selectedMine.length > 0 && (
              <>
                <button
                  type="button"
                  className={barButton}
                  onClick={async () => {
                    const ids = selectedMine.map((l) => l.id);
                    setLinks((prev) => prev.map((l) => (ids.includes(l.id) ? { ...l, archived: !showArchived } : l)));
                    const { error } = await supabase.from("google_links").update({ archived: !showArchived }).in("id", ids);
                    if (error) setError(error.message);
                    setSelected(new Set());
                  }}
                >
                  {showArchived ? "Restore" : "Archive"}
                </button>
                <button
                  type="button"
                  className={barButton}
                  onClick={() => {
                    void moveToOtherPage(selectedMine.map((l) => l.id));
                    setSelected(new Set());
                  }}
                >
                  Move to {otherPage}
                </button>
              </>
            )}
            <button type="button" className={`${barButton} opacity-70`} onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </div>
        </div>
      )}

      {form?.mode === "add" && (
        <LinkForm
          kind={kind}
          meId={meId}
          initialText={form.text}
          canEditAll
          tags={tags}
          sections={sections}
          projects={projects}
          onCreateTag={createTag}
          onSubmitNew={addEntries}
          onClose={() => setForm(null)}
        />
      )}
      {form?.mode === "edit" && (
        <LinkForm
          kind={kind}
          meId={meId}
          link={form.link}
          canEditAll={form.link.created_by === meId}
          tags={tags}
          initialTagIds={linkTags.get(form.link.id) ?? []}
          sections={sections}
          projects={projects}
          onCreateTag={createTag}
          onSubmitEdit={(values) => saveEdit(form.link, values)}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  );
}
