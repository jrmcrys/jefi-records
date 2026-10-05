/* Settings that belong to one person: which sidebar pages show, the intro
   text on each page, and the background music. Stored in profiles.personal. */

export type PageKey = "inbox" | "my-tasks" | "docs" | "sheets";

export const PAGE_KEYS: PageKey[] = ["inbox", "my-tasks", "docs", "sheets"];

export const PAGE_LABELS: Record<PageKey, string> = {
  inbox: "Inbox",
  "my-tasks": "My tasks",
  docs: "Docs",
  sheets: "Sheets",
};

export const DEFAULT_INTRO: Record<PageKey, string> = {
  inbox: "Mentions, assignments and comments on your tasks show up here.",
  "my-tasks": "Everything assigned to you, across all of your projects.",
  docs: "Keep your Google Doc links in one place. Rename them here, and open them inside Jefi Records or in Google. You can change the default in Settings.",
  sheets:
    "Keep your Google Sheet links in one place. Rename them here, and open them inside Jefi Records or in Google. You can change the default in Settings.",
};

export type MusicKind = "none" | "mp3" | "youtube";

export type Music = {
  kind: MusicKind;
  /** Path of the uploaded file in the private music bucket. */
  path?: string;
  /** File name shown in Settings. */
  fileName?: string;
  /** YouTube video id. */
  youtubeId?: string;
  youtubeUrl?: string;
  /** Show the embedded YouTube player or keep it out of sight. */
  showPlayer: boolean;
  loop: boolean;
  /** Start playing when the app opens. */
  autoplay: boolean;
};

export type Personal = {
  sidebar: Record<PageKey, boolean>;
  intro: Partial<Record<PageKey, string>>;
  music: Music;
};

export const DEFAULT_MUSIC: Music = {
  kind: "none",
  showPlayer: false,
  loop: true,
  autoplay: true,
};

export const DEFAULT_PERSONAL: Personal = {
  sidebar: { inbox: true, "my-tasks": true, docs: true, sheets: true },
  intro: {},
  music: DEFAULT_MUSIC,
};

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/* Pulls the video id out of the usual YouTube link shapes. */
export function parseYouTube(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (YT_ID.test(raw)) return raw;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\.|^m\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.split("/")[1] ?? null;
  else if (host === "youtube.com" || host === "music.youtube.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else {
      const m = /^\/(embed|shorts|live|v)\/([^/]+)/.exec(url.pathname);
      id = m ? m[2] : null;
    }
  }
  return id && YT_ID.test(id) ? id : null;
}

export function parsePersonal(raw: unknown): Personal {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const sb = (r.sidebar && typeof r.sidebar === "object" ? r.sidebar : {}) as Record<string, unknown>;
  const intro = (r.intro && typeof r.intro === "object" ? r.intro : {}) as Record<string, unknown>;
  const m = (r.music && typeof r.music === "object" ? r.music : {}) as Record<string, unknown>;

  const sidebar = { ...DEFAULT_PERSONAL.sidebar };
  for (const k of PAGE_KEYS) sidebar[k] = sb[k] !== false;

  const outIntro: Partial<Record<PageKey, string>> = {};
  for (const k of PAGE_KEYS) {
    if (typeof intro[k] === "string") outIntro[k] = (intro[k] as string).slice(0, 600);
  }

  const kind: MusicKind =
    m.kind === "mp3" || m.kind === "youtube" ? m.kind : "none";
  const music: Music = {
    kind,
    showPlayer: m.showPlayer === true,
    loop: m.loop !== false,
    autoplay: m.autoplay !== false,
  };
  if (typeof m.path === "string") music.path = m.path;
  if (typeof m.fileName === "string") music.fileName = m.fileName.slice(0, 200);
  if (typeof m.youtubeId === "string" && YT_ID.test(m.youtubeId)) {
    music.youtubeId = m.youtubeId;
  }
  if (typeof m.youtubeUrl === "string") music.youtubeUrl = m.youtubeUrl.slice(0, 300);
  if (kind === "mp3" && !music.path) music.kind = "none";
  if (kind === "youtube" && !music.youtubeId) music.kind = "none";

  return { sidebar, intro: outIntro, music };
}
