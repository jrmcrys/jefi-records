import { parseGoogleFile } from "./google";

export type NoteVisibility = "private" | "shared";

export type NoteRow = {
  id: string;
  owner_id: string;
  folder_id: string | null;
  title: string;
  text: string;
  visibility: NoteVisibility;
  emoji: string | null;
  image_url: string | null;
  archived: boolean;
  deleted_at: string | null;
  project_id: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

/* Everything except the full content, for the list. */
export const NOTE_LIST_COLUMNS =
  "id,owner_id,folder_id,title,text,visibility,emoji,image_url,archived,deleted_at,project_id,created_at,updated_at,updated_by";

export type FolderRow = {
  id: string;
  owner_id: string;
  parent_id: string | null;
  name: string;
  emoji: string | null;
  color: string | null;
  position: number;
};

export type NotePref = { pinned: boolean; last_opened_at: string | null };

export const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

export const TRASH_DAYS = 30;

/* What an embedded link turns into. Only known services get a player; any
   other https page is shown in a frame with an Open link under it, because
   many sites refuse to be framed. */
export type EmbedInfo = { src: string; provider: string; height: number };

function idFrom(re: RegExp, s: string): string | null {
  const m = re.exec(s);
  return m ? m[1] : null;
}

export function toEmbed(input: string): EmbedInfo | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.replace(/^www\.|^m\./, "");
  const full = url.toString();

  if (host === "youtube.com" || host === "youtu.be" || host === "music.youtube.com") {
    const id =
      host === "youtu.be"
        ? url.pathname.slice(1)
        : url.searchParams.get("v") ?? idFrom(/^\/(?:embed|shorts|live)\/([^/?]+)/, url.pathname);
    if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) {
      return { src: `https://www.youtube-nocookie.com/embed/${id}`, provider: "YouTube", height: 360 };
    }
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = idFrom(/(\d{6,})/, url.pathname);
    if (id) return { src: `https://player.vimeo.com/video/${id}`, provider: "Vimeo", height: 360 };
  }
  const g = parseGoogleFile(full);
  if (g) return { src: g.embedUrl, provider: "Google", height: g.type === "slides" ? 400 : 520 };
  if (host === "open.spotify.com") {
    const m = /^\/(?:intl-[a-z]+\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]+)/.exec(url.pathname);
    if (m) {
      const tall = m[1] !== "track" && m[1] !== "episode";
      return { src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, provider: "Spotify", height: tall ? 380 : 152 };
    }
  }
  if (host === "soundcloud.com") {
    return {
      src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(full)}&visual=false`,
      provider: "SoundCloud",
      height: 166,
    };
  }
  if (host === "loom.com") {
    const id = idFrom(/^\/(?:share|embed)\/([a-f0-9]+)/, url.pathname);
    if (id) return { src: `https://www.loom.com/embed/${id}`, provider: "Loom", height: 360 };
  }
  if (host === "figma.com") {
    return { src: `https://www.figma.com/embed?embed_host=jefi&url=${encodeURIComponent(full)}`, provider: "Figma", height: 450 };
  }
  if (host === "canva.com" && /^\/design\//.test(url.pathname)) {
    const base = full.split("?")[0].replace(/\/(edit|view)$/, "/view");
    return { src: `${base}?embed`, provider: "Canva", height: 450 };
  }
  if ((host === "google.com" || host === "maps.google.com") && url.pathname.startsWith("/maps")) {
    if (url.pathname.startsWith("/maps/embed")) return { src: full, provider: "Google Maps", height: 360 };
    const place = idFrom(/\/maps\/(?:place|search)\/([^/@]+)/, url.pathname);
    const q = url.searchParams.get("q") ?? (place ? decodeURIComponent(place.replace(/\+/g, " ")) : null);
    if (q) return { src: `https://maps.google.com/maps?q=${encodeURIComponent(q)}&output=embed`, provider: "Google Maps", height: 360 };
  }
  if (host === "calendar.google.com" && url.pathname.startsWith("/calendar/embed")) {
    return { src: full, provider: "Google Calendar", height: 500 };
  }
  if (host === "calendly.com") {
    return { src: `${full.split("?")[0]}?embed_type=Inline&hide_gdpr_banner=1`, provider: "Calendly", height: 640 };
  }
  if (host === "cal.com") {
    return { src: `${full.split("?")[0]}?embed=true`, provider: "Cal.com", height: 640 };
  }
  if (/\.pdf$/i.test(url.pathname)) return { src: full, provider: "PDF", height: 640 };
  return { src: full, provider: host, height: 480 };
}

export function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}
