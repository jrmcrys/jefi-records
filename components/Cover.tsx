"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import Popover from "./Popover";
import {
  baseCover,
  COVER_COLORS,
  COVER_DEFAULT_H,
  COVER_MAX_H,
  COVER_MIN_H,
  coverBackground,
  GRADIENTS,
  safeImageUrl,
  type Cover,
} from "@/lib/cover";
import { iconPathFromUrl, removeIcon, uploadCover } from "@/lib/imageUpload";

type Save = (next: Cover | null) => Promise<string | null>;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/* Deletes an uploaded cover file once nothing points at it any more. Pasted
   links and gradients have no file. */
async function dropFile(oldCover: Cover | null, next: Cover | null) {
  const old = oldCover?.kind === "image" ? oldCover.url : undefined;
  if (!old || !iconPathFromUrl(old)) return;
  if (next?.kind === "image" && next.url === old) return;
  await removeIcon(old);
}

/* The panel for choosing where a cover comes from. */
function SourcePicker({
  current,
  folder,
  onPick,
  close,
}: {
  current: Cover | null;
  folder: string;
  onPick: (next: Cover) => Promise<void>;
  close: () => void;
}) {
  const [tab, setTab] = useState<"upload" | "colors" | "link">("upload");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /* Keeps the height, dim and blur the person already chose. */
  const keep = {
    height: current?.height ?? COVER_DEFAULT_H,
    dim: current?.dim ?? 0,
    blur: current?.blur ?? 0,
  };

  async function pick(next: Cover) {
    setBusy(true);
    setError(null);
    try {
      await onPick(next);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the cover.");
    } finally {
      setBusy(false);
    }
  }

  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const url = await uploadCover(file, folder);
      await onPick(baseCover("image", { ...keep, url }));
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload that picture.");
    } finally {
      setBusy(false);
    }
  }

  function useLink(e: React.FormEvent) {
    e.preventDefault();
    const url = safeImageUrl(link);
    if (!url) {
      setError("Paste a full link that starts with https://");
      return;
    }
    setBusy(true);
    setError(null);
    const test = new Image();
    test.onload = () => void pick(baseCover("image", { ...keep, url }));
    test.onerror = () => {
      setBusy(false);
      setError("That link did not open as a picture. Use a direct image link.");
    };
    test.src = url;
  }

  const tabClass = (on: boolean) =>
    `flex-1 px-3 py-1.5 text-sm ${on ? "bg-accent/15 font-medium" : "opacity-70 hover:bg-current/10"}`;

  return (
    <div className="space-y-3">
      <div role="tablist" className="flex overflow-hidden rounded-md border border-current/20">
        <button type="button" role="tab" aria-selected={tab === "upload"} className={tabClass(tab === "upload")} onClick={() => setTab("upload")}>
          Upload
        </button>
        <button type="button" role="tab" aria-selected={tab === "colors"} className={tabClass(tab === "colors")} onClick={() => setTab("colors")}>
          Colors
        </button>
        <button type="button" role="tab" aria-selected={tab === "link"} className={tabClass(tab === "link")} onClick={() => setTab("link")}>
          Link
        </button>
      </div>

      {tab === "upload" && (
        <div className="space-y-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="w-full rounded-md border border-current/20 px-3 py-2 text-sm hover:border-current/50 disabled:opacity-50"
          >
            {busy ? "Uploading..." : "Choose a picture"}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickFile} />
          <p className="text-xs opacity-60">Wide pictures work best. Large files are shrunk before upload.</p>
        </div>
      )}

      {tab === "colors" && (
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-xs opacity-60">Gradients</p>
            <div className="grid grid-cols-4 gap-1.5">
              {GRADIENTS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  disabled={busy}
                  aria-label={`${g.label} gradient`}
                  title={g.label}
                  onClick={() => void pick(baseCover("gradient", { ...keep, value: g.id }))}
                  className={`h-10 rounded-md border hover:opacity-85 ${
                    current?.kind === "gradient" && current.value === g.id ? "border-current" : "border-current/15"
                  }`}
                  style={{ background: g.css }}
                />
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs opacity-60">Solid colors</p>
            <div className="grid grid-cols-6 gap-1.5">
              {COVER_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={busy}
                  aria-label={`Color ${c}`}
                  onClick={() => void pick(baseCover("color", { ...keep, value: c }))}
                  className={`h-8 rounded-md border hover:opacity-85 ${
                    current?.kind === "color" && current.value === c ? "border-current" : "border-current/15"
                  }`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "link" && (
        <form onSubmit={useLink} className="space-y-2">
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://..."
            aria-label="Image link"
            className="w-full rounded-md border border-current/20 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-current/50"
          />
          <button
            type="submit"
            disabled={busy || !link.trim()}
            className="w-full rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Checking..." : "Use this picture"}
          </button>
          <p className="text-xs opacity-60">The picture stays where it is online. If it is taken down, the cover goes blank.</p>
        </form>
      )}

      {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

/* "Add cover" when there is none, or "Show cover" when one was hidden. */
export function CoverAddButton({
  cover,
  folder,
  onSave,
  className,
}: {
  cover: Cover | null;
  folder: string;
  onSave: Save;
  className: string;
}) {
  const [error, setError] = useState<string | null>(null);

  if (cover?.hidden) {
    return (
      <>
        <button
          type="button"
          className={className}
          onClick={async () => setError(await onSave({ ...cover, hidden: false }))}
        >
          Show cover
        </button>
        {error && <span role="alert" className="text-xs text-red-500">{error}</span>}
      </>
    );
  }

  return (
    <Popover label="Add a cover" trigger="Add cover" buttonClassName={className} width={300}>
      {(close) => (
        <SourcePicker
          current={cover}
          folder={folder}
          close={close}
          onPick={async (next) => {
            const err = await onSave(next);
            if (err) throw new Error(err);
          }}
        />
      )}
    </Popover>
  );
}

const pill =
  "rounded-md bg-black/55 px-2.5 py-1 text-xs font-medium text-white backdrop-blur hover:bg-black/70";

/* The cover itself, full width at the top of the page. People who can edit
   it get Change, Reposition, Adjust, Hide and Remove on hover, and can drag
   the bottom edge to set the height. */
export default function CoverBanner({
  cover,
  canEdit,
  folder,
  onSave,
}: {
  cover: Cover;
  canEdit: boolean;
  folder: string;
  onSave: Save;
}) {
  const [draft, setDraft] = useState<Cover>(cover);
  const [mode, setMode] = useState<"view" | "reposition">("view");
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const sizing = useRef<{ py: number; h: number; factor: number } | null>(null);
  const [resizing, setResizing] = useState(false);

  /* Follow saved changes (including the other person's, for projects). */
  const coverKey = JSON.stringify(cover);
  const [synced, setSynced] = useState(coverKey);
  if (synced !== coverKey) {
    setSynced(coverKey);
    if (mode === "view" && !resizing) setDraft(cover);
  }

  async function save(next: Cover | null) {
    setError(null);
    const before = cover;
    const err = await onSave(next);
    if (err) {
      setError(err);
      setDraft(before);
      return false;
    }
    await dropFile(before, next);
    return true;
  }

  /* Reposition: drag the picture. */
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (mode !== "reposition") return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, x: draft.x, y: draft.y };
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const box = boxRef.current;
    if (!d || !box) return;
    const rect = box.getBoundingClientRect();
    const speed = 100 / draft.zoom;
    setDraft((c) => ({
      ...c,
      x: clamp(d.x - ((e.clientX - d.px) / rect.width) * speed, 0, 100),
      y: clamp(d.y - ((e.clientY - d.py) / rect.height) * speed * 1.5, 0, 100),
    }));
  }
  function onPointerUp() {
    drag.current = null;
  }

  function nudge(e: React.KeyboardEvent) {
    if (mode !== "reposition") return;
    const step = e.shiftKey ? 10 : 2;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    setDraft((c) => ({ ...c, x: clamp(c.x + m[0], 0, 100), y: clamp(c.y + m[1], 0, 100) }));
  }

  /* Height: drag the bottom edge. Phones show 60 percent of the height, so a
     drag there moves the saved value faster. */
  function startResize(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const desktop = window.matchMedia("(min-width: 768px)").matches;
    sizing.current = { py: e.clientY, h: draft.height, factor: desktop ? 1 : 1 / 0.6 };
    setResizing(true);
  }
  function moveResize(e: React.PointerEvent<HTMLDivElement>) {
    const s = sizing.current;
    if (!s) return;
    const h = clamp(Math.round(s.h + (e.clientY - s.py) * s.factor), COVER_MIN_H, COVER_MAX_H);
    setDraft((c) => ({ ...c, height: h }));
  }
  function endResize() {
    if (!sizing.current) return;
    sizing.current = null;
    setResizing(false);
    if (draft.height !== cover.height) void save({ ...cover, height: draft.height });
  }
  function keyResize(e: React.KeyboardEvent) {
    const delta = e.key === "ArrowDown" ? 10 : e.key === "ArrowUp" ? -10 : 0;
    if (!delta) return;
    e.preventDefault();
    const h = clamp(draft.height + delta, COVER_MIN_H, COVER_MAX_H);
    setDraft((c) => ({ ...c, height: h }));
    void save({ ...cover, height: h });
  }

  const shown = draft;
  const bg = coverBackground(shown);
  const blur = shown.blur > 0 ? `blur(${shown.blur}px)` : undefined;
  // A blurred picture fades at its edges, so it is scaled up a little.
  const scale = shown.zoom * (shown.blur > 0 ? 1 + shown.blur / 60 : 1);

  useEffect(() => {
    if (mode !== "reposition") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDraft(cover);
        setMode("view");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, cover]);

  return (
    <div
      ref={boxRef}
      style={{ "--cover-h": `${shown.height}px` } as React.CSSProperties}
      className="group/banner relative h-[max(100px,calc(var(--cover-h)*0.6))] w-full overflow-hidden md:h-(--cover-h)"
    >
      <div
        role={mode === "reposition" ? "application" : undefined}
        aria-label={mode === "reposition" ? "Drag or use the arrow keys to position the cover" : undefined}
        tabIndex={mode === "reposition" ? 0 : undefined}
        onKeyDown={nudge}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={`absolute inset-0 touch-none ${mode === "reposition" ? "cursor-grab active:cursor-grabbing" : ""}`}
      >
        {shown.kind === "image" && shown.url ? (
          <img
            src={shown.url}
            alt=""
            draggable={false}
            className="pointer-events-none absolute inset-0 size-full select-none object-cover"
            style={{
              objectPosition: `${shown.x}% ${shown.y}%`,
              transform: scale !== 1 ? `scale(${scale})` : undefined,
              transformOrigin: `${shown.x}% ${shown.y}%`,
              filter: blur,
            }}
          />
        ) : (
          <div className="absolute inset-0" style={{ background: bg, filter: blur, transform: blur ? "scale(1.1)" : undefined }} />
        )}
        {shown.dim > 0 && <div className="absolute inset-0 bg-black" style={{ opacity: shown.dim }} />}
      </div>

      {mode === "reposition" && (
        <>
          <p className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md bg-black/55 px-3 py-1.5 text-xs text-white">
            Drag the picture to position it
          </p>
          <div className="absolute bottom-3 right-3 flex flex-wrap items-center gap-2 rounded-md bg-black/55 px-2.5 py-1.5 text-xs text-white backdrop-blur">
            <label className="flex items-center gap-2">
              Zoom
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={draft.zoom}
                onChange={(e) => setDraft((c) => ({ ...c, zoom: Number(e.target.value) }))}
                className="w-24 accent-white"
              />
            </label>
            <button
              type="button"
              onClick={async () => {
                if (await save(draft)) setMode("view");
              }}
              className="rounded bg-white px-2 py-0.5 font-medium text-black"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(cover);
                setMode("view");
              }}
              className="rounded px-2 py-0.5 underline"
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {canEdit && mode === "view" && (
        <div className="absolute bottom-3 right-3 flex flex-wrap justify-end gap-1.5 opacity-0 transition-opacity group-hover/banner:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
          <Popover label="Change cover" trigger="Change" buttonClassName={pill} width={300}>
            {(close) => (
              <SourcePicker
                current={cover}
                folder={folder}
                close={close}
                onPick={async (next) => {
                  if (!(await save(next))) throw new Error("Could not save the cover.");
                }}
              />
            )}
          </Popover>
          {cover.kind === "image" && (
            <button
              type="button"
              className={pill}
              onClick={() => {
                setDraft(cover);
                setMode("reposition");
                requestAnimationFrame(() =>
                  boxRef.current?.querySelector<HTMLElement>("[role=application]")?.focus()
                );
              }}
            >
              Reposition
            </button>
          )}
          <Popover label="Dim or blur the cover" trigger="Adjust" buttonClassName={pill} width={240}>
            {() => (
              <div className="space-y-3 p-1 text-sm">
                <label className="block">
                  <span className="flex justify-between text-xs opacity-70">
                    <span>Dim</span>
                    <span>{Math.round(draft.dim * 100)}%</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={0.7}
                    step={0.05}
                    value={draft.dim}
                    onChange={(e) => setDraft((c) => ({ ...c, dim: Number(e.target.value) }))}
                    onPointerUp={() => void save({ ...cover, dim: draft.dim, blur: draft.blur })}
                    onKeyUp={() => void save({ ...cover, dim: draft.dim, blur: draft.blur })}
                    className="w-full"
                  />
                </label>
                <label className="block">
                  <span className="flex justify-between text-xs opacity-70">
                    <span>Blur</span>
                    <span>{draft.blur}px</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={12}
                    step={1}
                    value={draft.blur}
                    onChange={(e) => setDraft((c) => ({ ...c, blur: Number(e.target.value) }))}
                    onPointerUp={() => void save({ ...cover, dim: draft.dim, blur: draft.blur })}
                    onKeyUp={() => void save({ ...cover, dim: draft.dim, blur: draft.blur })}
                    className="w-full"
                  />
                </label>
              </div>
            )}
          </Popover>
          <button type="button" className={pill} onClick={() => void save({ ...cover, hidden: true })}>
            Hide
          </button>
          <button
            type="button"
            className={pill}
            onClick={() => {
              if (window.confirm("Remove this cover? Hide keeps it so you can show it again.")) void save(null);
            }}
          >
            Remove
          </button>
        </div>
      )}

      {canEdit && mode === "view" && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Cover height. Drag, or use the up and down arrow keys. Double-click to reset."
          aria-valuemin={COVER_MIN_H}
          aria-valuemax={COVER_MAX_H}
          aria-valuenow={draft.height}
          tabIndex={0}
          onPointerDown={startResize}
          onPointerMove={moveResize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          onKeyDown={keyResize}
          onDoubleClick={() => {
            setDraft((c) => ({ ...c, height: COVER_DEFAULT_H }));
            void save({ ...cover, height: COVER_DEFAULT_H });
          }}
          className="absolute inset-x-0 bottom-0 h-2.5 cursor-row-resize touch-none bg-transparent hover:bg-white/30 focus-visible:bg-white/40"
        />
      )}

      {error && (
        <p role="alert" className="absolute left-3 top-3 rounded-md bg-red-600 px-2.5 py-1 text-xs text-white">
          {error}
        </p>
      )}
    </div>
  );
}
