"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { usePersonal } from "./PersonalProvider";
import {
  PAGE_KEYS,
  PAGE_LABELS,
  parseYouTube,
  type Music,
} from "@/lib/personal";
import { removeIcon, uploadIcon } from "@/lib/imageUpload";

const MAX_MUSIC_BYTES = 30 * 1024 * 1024;

function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-md border border-current/15 px-3 py-2 ${
        disabled ? "opacity-50" : ""
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 accent-accent"
      />
      <span>
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-xs opacity-60">{hint}</span>}
      </span>
    </label>
  );
}

/* Which pages appear in the sidebar. Yours only. */
export function SidebarSettings() {
  const { personal, update } = usePersonal();
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="mt-8">
      <h2 className="text-sm font-medium">Sidebar pages</h2>
      <p className="mt-1 text-xs opacity-60">
        Choose which pages show below your projects. This is for you only, and
        turning a page off does not delete anything.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {PAGE_KEYS.map((key) => (
          <Toggle
            key={key}
            label={PAGE_LABELS[key]}
            checked={personal.sidebar[key]}
            onChange={async (v) => {
              setError(null);
              const err = await update((p) => ({
                ...p,
                sidebar: { ...p.sidebar, [key]: v },
              }));
              if (err) setError(err);
            }}
          />
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-500">
          {error}
        </p>
      )}
    </section>
  );
}

/* The picture beside "Jefi Records". Shared, so it changes for both of you. */
export function LogoSettings() {
  const { branding, setLogo } = usePersonal();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const url = await uploadIcon(file, "logo", { size: 256, crop: false });
      const old = branding.logoUrl;
      const err = await setLogo(url);
      if (err) throw new Error(err);
      if (old) await removeIcon(old);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload the logo.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const old = branding.logoUrl;
    const err = await setLogo(null);
    if (err) setError(err);
    else if (old) await removeIcon(old);
    setBusy(false);
  }

  return (
    <section className="mt-8">
      <h2 className="text-sm font-medium">Logo</h2>
      <p className="mt-1 text-xs opacity-60">
        Shows beside Jefi Records in the sidebar. The logo is shared, so it
        changes for both of you.
      </p>
      <div className="mt-3 flex items-center gap-4">
        <div className="flex size-14 items-center justify-center rounded-lg border border-dashed border-current/30">
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt="Current logo" className="size-12 object-contain" />
          ) : (
            <span className="text-xs opacity-50">None</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="rounded-md border border-current/20 px-3 py-2 text-sm hover:border-current/50 disabled:opacity-50"
          >
            {branding.logoUrl ? "Change logo" : "Upload logo"}
          </button>
          {branding.logoUrl && (
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className="rounded-md px-3 py-2 text-sm underline opacity-70 hover:opacity-100 disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pick} />
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-500">
          {error}
        </p>
      )}
    </section>
  );
}

/* Background music that starts when you open Jefi Records. Yours only. */
export function MusicSettings() {
  const { personal, update, me } = usePersonal();
  const m = personal.music;
  const fileRef = useRef<HTMLInputElement>(null);
  const [link, setLink] = useState(m.youtubeUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(next: Music): Promise<boolean> {
    setError(null);
    const err = await update((p) => ({ ...p, music: next }));
    if (err) {
      setError(err);
      return false;
    }
    return true;
  }

  async function removeFile(path?: string) {
    if (!path) return;
    const supabase = createClient();
    await supabase.storage.from("music").remove([path]);
  }

  async function chooseNone() {
    setMessage(null);
    const old = m.path;
    if (await save({ ...m, kind: "none", path: undefined, fileName: undefined })) {
      await removeFile(old);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setMessage(null);
    if (!file.type.startsWith("audio/")) {
      setError("Choose an audio file such as an MP3.");
      return;
    }
    if (file.size > MAX_MUSIC_BYTES) {
      setError("That file is over 30 MB. Pick a shorter or smaller one.");
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "") : "mp3";
      const path = `${me}/${crypto.randomUUID()}.${ext || "mp3"}`;
      const up = await supabase.storage
        .from("music")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) throw up.error;
      const old = m.path;
      const ok = await save({
        ...m,
        kind: "mp3",
        path,
        fileName: file.name,
      });
      if (ok) {
        await removeFile(old);
        setMessage("Song saved. It will play the next time you open Jefi Records.");
      } else {
        await removeFile(path);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload that file.");
    } finally {
      setBusy(false);
    }
  }

  async function saveLink(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const id = parseYouTube(link);
    if (!id) {
      setError("That does not look like a YouTube link.");
      return;
    }
    const old = m.path;
    if (
      await save({
        ...m,
        kind: "youtube",
        youtubeId: id,
        youtubeUrl: link.trim(),
        path: undefined,
        fileName: undefined,
      })
    ) {
      await removeFile(old);
      setMessage("YouTube audio saved. It will play the next time you open Jefi Records.");
    }
  }

  const choice: Music["kind"] = m.kind;

  return (
    <section className="mt-10">
      <h2 className="text-sm font-medium">Music</h2>
      <p className="mt-1 text-xs opacity-60">
        Plays when you open Jefi Records, for you only. Browsers wait for your
        first tap or click before they play sound, so the music starts then.
      </p>

      <div
        role="radiogroup"
        aria-label="Music source"
        className="mt-3 flex overflow-hidden rounded-md border border-current/20 text-sm"
      >
        {(
          [
            ["none", "No music"],
            ["mp3", "MP3 file"],
            ["youtube", "YouTube"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={choice === value}
            disabled={busy}
            onClick={() => {
              setMessage(null);
              if (value === "none") void chooseNone();
              else if (value === "mp3" && m.path) void save({ ...m, kind: "mp3" });
              else if (value === "youtube" && m.youtubeId) void save({ ...m, kind: "youtube" });
              else setMessage(value === "mp3" ? "Upload an MP3 below to use it." : "Paste a YouTube link below to use it.");
            }}
            className={`flex-1 px-3 py-2 ${
              choice === value ? "bg-accent/15 font-medium" : "opacity-70 hover:bg-current/10"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        <div className="rounded-lg border border-current/15 p-3">
          <p className="text-sm font-medium">MP3 file</p>
          <p className="mt-0.5 text-xs opacity-60">
            Up to 30 MB. Only you can hear and download it.
            {m.path && m.fileName ? ` Current file: ${m.fileName}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="rounded-md border border-current/20 px-3 py-2 text-sm hover:border-current/50 disabled:opacity-50"
            >
              {busy ? "Uploading..." : m.path ? "Replace file" : "Upload an MP3"}
            </button>
          </div>
          <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={onFile} />
        </div>

        <form onSubmit={saveLink} className="rounded-lg border border-current/15 p-3">
          <label htmlFor="yt-link" className="text-sm font-medium">
            YouTube link
          </label>
          <p className="mt-0.5 text-xs opacity-60">
            Plays the audio of a song or video through an embedded player.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              id="yt-link"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="min-w-0 flex-1 rounded-md border border-current/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-current/50"
            />
            <button
              type="submit"
              disabled={!link.trim()}
              className="rounded-md border border-current/20 px-3 py-2 text-sm hover:border-current/50 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </form>

        <div className="grid gap-2">
          <Toggle
            label="Start when I open Jefi Records"
            checked={m.autoplay}
            onChange={(v) => void save({ ...m, autoplay: v })}
          />
          <Toggle
            label="Repeat the song"
            checked={m.loop}
            onChange={(v) => void save({ ...m, loop: v })}
          />
          <Toggle
            label="Show the YouTube player"
            hint="Off keeps the video out of sight. The play and pause button stays."
            checked={m.showPlayer}
            onChange={(v) => void save({ ...m, showPlayer: v })}
          />
        </div>
      </div>

      {message && (
        <p role="status" className="mt-3 text-sm">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-500">
          {error}
        </p>
      )}
    </section>
  );
}
