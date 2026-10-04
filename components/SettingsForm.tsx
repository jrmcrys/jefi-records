"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";
import Avatar from "./Avatar";

const AVATAR_BUCKET = "avatars";
const AVATAR_SIZE = 256;

async function squarePhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser could not process the image.");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Could not prepare the photo.")),
      "image/jpeg",
      0.9
    );
  });
}

function storagePathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/object/public/${AVATAR_BUCKET}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length));
}

export default function SettingsForm({ me }: { me: Profile }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(me.name);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    me.avatar_url ?? null
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty = name.trim() !== me.name;

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ name: trimmed })
      .eq("id", me.id);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setMessage("Name saved.");
    router.refresh();
  }

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const supabase = createClient();
      const blob = await squarePhoto(file);
      const path = `${me.id}/${Date.now()}.jpg`;
      const upload = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (upload.error) throw upload.error;

      const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      const update = await supabase
        .from("profiles")
        .update({ avatar_url: data.publicUrl })
        .eq("id", me.id);
      if (update.error) throw update.error;

      const oldPath = storagePathFromUrl(avatarUrl);
      if (oldPath) await supabase.storage.from(AVATAR_BUCKET).remove([oldPath]);

      setAvatarUrl(data.publicUrl);
      setMessage("Photo updated.");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not upload the photo. Try a JPEG or PNG."
      );
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto() {
    setBusy(true);
    setError(null);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: null })
      .eq("id", me.id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const oldPath = storagePathFromUrl(avatarUrl);
    if (oldPath) await supabase.storage.from(AVATAR_BUCKET).remove([oldPath]);
    setAvatarUrl(null);
    setBusy(false);
    setMessage("Photo removed.");
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm opacity-70">
        How you appear to Effie and Jerome across Jefi Records.
      </p>

      <section className="mt-8">
        <h2 className="text-sm font-medium">Profile photo</h2>
        <div className="mt-3 flex items-center gap-4">
          <Avatar profile={{ name, avatar_url: avatarUrl }} size={72} />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="rounded-md border border-current/20 px-3 py-2 text-sm hover:border-current/50 disabled:opacity-50"
            >
              {avatarUrl ? "Change photo" : "Upload photo"}
            </button>
            {avatarUrl && (
              <button
                type="button"
                disabled={busy}
                onClick={removePhoto}
                className="rounded-md px-3 py-2 text-sm underline opacity-70 hover:opacity-100 disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onPickPhoto}
          />
        </div>
        <p className="mt-2 text-xs opacity-60">
          Photos are cropped to a square. Any image works, up to 2 MB after
          resizing.
        </p>
      </section>

      <form onSubmit={saveName} className="mt-8">
        <label htmlFor="display-name" className="text-sm font-medium">
          Display name
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="display-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            className="min-w-0 flex-1 rounded-md border border-current/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-current/50"
          />
          <button
            type="submit"
            disabled={busy || !dirty || !name.trim()}
            className="rounded-md border border-current/20 px-3 py-2 text-sm hover:border-current/50 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </form>

      <section className="mt-8">
        <h2 className="text-sm font-medium">Email</h2>
        <p className="mt-2 text-sm opacity-70">{me.email}</p>
        <p className="mt-1 text-xs opacity-60">
          Your sign-in email is fixed because it is on the invite list.
        </p>
      </section>

      {message && (
        <p role="status" className="mt-6 text-sm">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-6 text-sm text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
