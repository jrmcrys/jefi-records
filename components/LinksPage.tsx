"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createClient } from "@/lib/supabase/client";
import {
  KIND_LABELS,
  embedUrlFor,
  parseGoogleLink,
  type LinkKind,
  type LinkOpen,
} from "@/lib/google";
import { PROFILE_COLUMNS, type Profile, type Visibility } from "@/lib/types";
import Avatar from "./Avatar";
import Menu, { MenuItem } from "./Menu";
import PageIntro from "./PageIntro";

type LinkRow = {
  id: string;
  kind: LinkKind;
  title: string;
  url: string;
  visibility: Visibility;
  created_by: string;
  created_at: string;
};

function LockIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      role="img"
      aria-label="Private"
      className="shrink-0 opacity-60"
    >
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  );
}

function FileIcon({ kind }: { kind: LinkKind }) {
  return (
    <span
      aria-hidden="true"
      className={`flex size-8 shrink-0 items-center justify-center rounded text-xs font-bold text-white ${
        kind === "doc" ? "bg-blue-600" : "bg-green-600"
      }`}
    >
      {kind === "doc" ? "D" : "S"}
    </span>
  );
}

function Row({
  link,
  owner,
  mine,
  draggable,
  onOpen,
  onRename,
  onToggleVisibility,
  onDelete,
}: {
  link: LinkRow;
  owner?: Profile;
  mine: boolean;
  draggable: boolean;
  onOpen: (viaGoogle: boolean) => void;
  onRename: (title: string) => void;
  onToggleVisibility: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: link.id, disabled: !draggable });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className="group flex items-center gap-2 border-b border-current/10 py-2"
    >
      <div className="flex size-7 shrink-0 items-center justify-center">
        {draggable && (
          <button
            type="button"
            aria-label={`Drag to reorder ${link.title}`}
            {...attributes}
            {...listeners}
            className="flex size-6 cursor-grab touch-none items-center justify-center rounded text-xs opacity-50 hover:bg-current/10 hover:opacity-100 active:cursor-grabbing"
          >
            {"⋮⋮"}
          </button>
        )}
      </div>
      <FileIcon kind={link.kind} />
      <div className="min-w-0 flex-1">
        {mine ? (
          <input
            key={`${link.id}:${link.title}`}
            defaultValue={link.title}
            aria-label="Title"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (!v) e.target.value = link.title;
              else if (v !== link.title) onRename(v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            className="w-full rounded bg-transparent px-1.5 py-1 text-sm font-medium outline-none hover:bg-current/5 focus:bg-current/5"
          />
        ) : (
          <p className="truncate px-1.5 py-1 text-sm font-medium">{link.title}</p>
        )}
        <p className="flex items-center gap-1.5 px-1.5 text-xs opacity-60">
          {link.visibility === "private" && <LockIcon />}
          {!mine && owner && (
            <>
              <Avatar profile={owner} size={14} />
              <span>Added by {owner.name}</span>
            </>
          )}
          {mine && (
            <span>{link.visibility === "private" ? "Only you" : "Shared with everyone"}</span>
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onOpen(false)}
        className="rounded-md border border-current/20 px-3 py-1.5 text-sm hover:border-current/50"
      >
        Open
      </button>
      <Menu label={`Actions for ${link.title}`}>
        <MenuItem onClick={() => onOpen(true)}>Open in Google</MenuItem>
        {mine && (
          <MenuItem onClick={onToggleVisibility}>
            {link.visibility === "private" ? "Share with everyone" : "Make private"}
          </MenuItem>
        )}
        {mine && (
          <MenuItem onClick={onDelete} danger>
            Delete
          </MenuItem>
        )}
      </Menu>
    </li>
  );
}

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
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [order, setOrder] = useState<Map<string, number>>(new Map());
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [viewing, setViewing] = useState<LinkRow | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const load = useCallback(async () => {
    const [l, p, pr] = await Promise.all([
      supabase
        .from("google_links")
        .select("id,kind,title,url,visibility,created_by,created_at")
        .eq("kind", kind)
        .order("created_at"),
      supabase.from("google_link_prefs").select("link_id,position"),
      supabase.from("profiles").select(PROFILE_COLUMNS),
    ]);
    const err = l.error ?? p.error ?? pr.error;
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    setLinks((l.data ?? []) as LinkRow[]);
    setOrder(
      new Map(
        ((p.data ?? []) as { link_id: string; position: number }[]).map((r) => [
          r.link_id,
          r.position,
        ])
      )
    );
    setProfiles((pr.data ?? []) as Profile[]);
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
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, kind, load]);

  const ordered = useMemo(() => {
    const withPos = links.filter((l) => order.has(l.id));
    const without = links.filter((l) => !order.has(l.id));
    withPos.sort((a, b) => (order.get(a.id) as number) - (order.get(b.id) as number));
    return [...withPos, ...without];
  }, [links, order]);

  const q = query.trim().toLowerCase();
  const shown = q ? ordered.filter((l) => l.title.toLowerCase().includes(q)) : ordered;
  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  async function addLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = parseGoogleLink(kind, url);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    const { error } = await supabase.from("google_links").insert({
      kind,
      title: title.trim() || labels.untitled,
      url: parsed.url,
      visibility,
      created_by: meId,
    });
    if (error) {
      setError(error.message);
      return;
    }
    setTitle("");
    setUrl("");
    load();
  }

  async function patch(id: string, values: Partial<LinkRow>) {
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, ...values } : l)));
    const { error } = await supabase.from("google_links").update(values).eq("id", id);
    if (error) {
      setError(error.message);
      load();
    }
  }

  async function remove(link: LinkRow) {
    if (!window.confirm(`Remove "${link.title}" from this list? The file in Google is not touched.`))
      return;
    setLinks((prev) => prev.filter((l) => l.id !== link.id));
    if (viewing?.id === link.id) setViewing(null);
    const { error } = await supabase.from("google_links").delete().eq("id", link.id);
    if (error) {
      setError(error.message);
      load();
    }
  }

  async function changeVisibility(link: LinkRow) {
    const next: Visibility = link.visibility === "private" ? "public" : "private";
    const ok = window.confirm(
      next === "private"
        ? "Make this link private? Only you will see it."
        : "Share this link with everyone? Both of you will see it."
    );
    if (ok) patch(link.id, { visibility: next });
  }

  function open(link: LinkRow, viaGoogle: boolean) {
    const wantsGoogle = viaGoogle || linkOpen === "google";
    if (wantsGoogle) {
      window.open(link.url, "_blank", "noopener,noreferrer");
    } else {
      setViewing(link);
    }
  }

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ordered.findIndex((l) => l.id === active.id);
    const to = ordered.findIndex((l) => l.id === over.id);
    if (from < 0 || to < 0) return;
    const next = [...ordered];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setOrder(new Map(next.map((l, i) => [l.id, (i + 1) * 1000])));
    const { error } = await supabase.from("google_link_prefs").upsert(
      next.map((l, i) => ({ user_id: meId, link_id: l.id, position: (i + 1) * 1000 })),
      { onConflict: "user_id,link_id" }
    );
    if (error) {
      setError(error.message);
      load();
    }
  }

  if (viewing) {
    const embed = embedUrlFor(viewing.kind, viewing.url);
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
          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{viewing.title}</h1>
          <a
            href={viewing.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white"
          >
            Open in Google
          </a>
        </div>
        <p className="mt-2 text-xs opacity-60">
          If the file stays blank here, Google is asking you to sign in or is blocking the
          embed. Use Open in Google, which always works.
        </p>
        {embed ? (
          <iframe
            key={viewing.id}
            src={embed}
            title={viewing.title}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
            referrerPolicy="no-referrer-when-downgrade"
            className="mt-3 w-full flex-1 rounded-md border border-current/20 bg-white"
          />
        ) : (
          <p className="mt-4 text-sm">This link cannot be embedded. Use Open in Google.</p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
      <h1 className="px-1.5 py-1 text-2xl font-semibold tracking-tight">{labels.plural}</h1>
      <div className="px-1.5">
        <PageIntro page={kind === "doc" ? "docs" : "sheets"} />
      </div>

      <form onSubmit={addLink} className="mt-5 space-y-2 rounded-lg border border-current/15 p-3">
        <p className="text-sm font-medium">Add a {labels.singular}</p>
        <div className="flex flex-wrap gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={`Paste the link, ${labels.example}`}
            aria-label={`${labels.singular} link`}
            className="min-w-0 flex-[2] basis-60 rounded-md border border-current/20 bg-transparent px-3 py-2 text-sm outline-none placeholder:opacity-50 focus:border-current/50"
          />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Name (optional)"
            aria-label="Name"
            className="min-w-0 flex-1 basis-40 rounded-md border border-current/20 bg-transparent px-3 py-2 text-sm outline-none placeholder:opacity-50 focus:border-current/50"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="radiogroup"
            aria-label="Who can see this link"
            className="flex overflow-hidden rounded-md border border-current/20 text-xs"
          >
            {(
              [
                ["public", "Shared with Effie and Jerome"],
                ["private", "Only me"],
              ] as const
            ).map(([value, text]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={visibility === value}
                onClick={() => setVisibility(value)}
                className={`px-3 py-1.5 ${
                  visibility === value ? "bg-accent/15 font-medium" : "opacity-70 hover:bg-current/10"
                }`}
              >
                {text}
              </button>
            ))}
          </div>
          <button
            type="submit"
            disabled={!url.trim()}
            className="ml-auto rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </form>

      {error && (
        <div
          role="alert"
          className="mt-3 flex items-start justify-between gap-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm"
        >
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="shrink-0 underline">
            Dismiss
          </button>
        </div>
      )}

      <div className="mt-6">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${labels.plural.toLowerCase()}`}
          aria-label={`Search ${labels.plural.toLowerCase()}`}
          className="w-full rounded-md border border-current/20 bg-transparent px-3 py-2 text-sm outline-none placeholder:opacity-50 focus:border-current/50"
        />
      </div>

      {loading ? (
        <p className="mt-6 text-sm opacity-60">Loading...</p>
      ) : shown.length === 0 ? (
        <p className="mt-6 text-sm opacity-60">
          {q
            ? "Nothing matches that search."
            : `No ${labels.plural.toLowerCase()} yet. Paste a link above to add the first one.`}
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={shown.map((l) => l.id)} strategy={verticalListSortingStrategy}>
            <ul className="mt-2 border-t border-current/10">
              {shown.map((l) => (
                <Row
                  key={l.id}
                  link={l}
                  owner={profileById.get(l.created_by)}
                  mine={l.created_by === meId}
                  draggable={!q}
                  onOpen={(viaGoogle) => open(l, viaGoogle)}
                  onRename={(t) => patch(l.id, { title: t })}
                  onToggleVisibility={() => changeVisibility(l)}
                  onDelete={() => remove(l)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
