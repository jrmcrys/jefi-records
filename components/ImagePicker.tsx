"use client";

import { useRef, useState } from "react";
import Popover from "./Popover";
import ProjectImage from "./ProjectImage";
import { removeIcon, uploadIcon } from "@/lib/imageUpload";

const EMOJI = [
  "📁", "📌", "📝", "📊", "📈", "📅", "💡", "🎯", "🚀", "⭐", "🔥", "💼",
  "🏠", "🛒", "✈️", "🎓", "💰", "🧾", "📣", "🎨", "🎬", "🎵", "📷", "🛠️",
  "🧪", "🌱", "🌲", "🌊", "☀️", "🌙", "❤️", "💜", "💙", "💚", "🧡", "🖤",
  "🐶", "🐱", "🦊", "🐼", "🍕", "☕", "🍰", "🎁", "🏃", "🧘", "📚", "💻",
];

export type PickedImage = { imageUrl: string | null; emoji: string | null };

function Body({
  name,
  value,
  folder,
  cropSquare,
  onChange,
  close,
}: {
  name: string;
  value: PickedImage;
  folder: string;
  cropSquare: boolean;
  onChange: (next: PickedImage) => void | Promise<void>;
  close: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"photo" | "emoji">(value.emoji ? "emoji" : "photo");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const url = await uploadIcon(file, folder, { crop: cropSquare });
      const old = value.imageUrl;
      await onChange({ imageUrl: url, emoji: null });
      if (old) await removeIcon(old);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload that image.");
    } finally {
      setBusy(false);
    }
  }

  async function pickEmoji(emoji: string) {
    const old = value.imageUrl;
    await onChange({ imageUrl: null, emoji });
    if (old) await removeIcon(old);
    close();
  }

  async function reset() {
    const old = value.imageUrl;
    await onChange({ imageUrl: null, emoji: null });
    if (old) await removeIcon(old);
    close();
  }

  const tabClass = (on: boolean) =>
    `flex-1 px-3 py-1.5 text-sm ${on ? "bg-accent/15 font-medium" : "opacity-70 hover:bg-current/10"}`;

  return (
    <div className="space-y-3">
      <div role="tablist" className="flex overflow-hidden rounded-md border border-current/20">
        <button type="button" role="tab" aria-selected={tab === "photo"} className={tabClass(tab === "photo")} onClick={() => setTab("photo")}>
          Photo
        </button>
        <button type="button" role="tab" aria-selected={tab === "emoji"} className={tabClass(tab === "emoji")} onClick={() => setTab("emoji")}>
          Emoji
        </button>
      </div>

      {tab === "photo" ? (
        <div className="space-y-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="w-full rounded-md border border-current/20 px-3 py-2 text-sm hover:border-current/50 disabled:opacity-50"
          >
            {busy ? "Uploading..." : value.imageUrl ? "Choose a different photo" : "Upload a photo"}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickFile} />
          <p className="text-xs opacity-60">Any image works. It is resized to fit.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-8 gap-1">
            {EMOJI.map((e) => (
              <button
                key={e}
                type="button"
                aria-label={`Use ${e}`}
                onClick={() => void pickEmoji(e)}
                className="flex size-8 items-center justify-center rounded text-lg hover:bg-current/10"
              >
                {e}
              </button>
            ))}
          </div>
          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              const first = Array.from(typed.trim())[0];
              if (first) void pickEmoji(first);
            }}
            className="flex gap-2"
          >
            <input
              value={typed}
              onChange={(ev) => setTyped(ev.target.value)}
              placeholder="Type or paste any emoji"
              aria-label="Any emoji"
              className="min-w-0 flex-1 rounded-md border border-current/20 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-current/50"
            />
            <button type="submit" disabled={!typed.trim()} className="rounded-md border border-current/20 px-3 py-1.5 text-sm disabled:opacity-40">
              Use
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => void reset()}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-current/10"
      >
        <ProjectImage name={name} size={20} />
        <span>Use initials</span>
      </button>

      {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

/* A picture that opens a small panel for choosing a photo, an emoji, or
   going back to initials. */
export default function ImagePicker({
  name,
  value,
  folder,
  size = 36,
  cropSquare = true,
  onChange,
}: {
  name: string;
  value: PickedImage;
  /** Folder in the shared icons bucket where uploads go. */
  folder: string;
  size?: number;
  cropSquare?: boolean;
  onChange: (next: PickedImage) => void | Promise<void>;
}) {
  return (
    <Popover
      label={`Change picture for ${name}`}
      width={300}
      buttonClassName="rounded-md hover:opacity-80 focus-visible:outline-2"
      trigger={<ProjectImage name={name} imageUrl={value.imageUrl} emoji={value.emoji} size={size} />}
    >
      {(close) => (
        <Body name={name} value={value} folder={folder} cropSquare={cropSquare} onChange={onChange} close={close} />
      )}
    </Popover>
  );
}
