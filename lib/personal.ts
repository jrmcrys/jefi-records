import { parseCover, type Cover } from "./cover";

/* Settings that belong to one person: which sidebar pages show, the intro
   text on each page, and the background music. Stored in profiles.personal. */

export type PageKey = "home" | "inbox" | "my-tasks" | "docs" | "sheets" | "notes";

export const PAGE_KEYS: PageKey[] = ["home", "inbox", "my-tasks", "docs", "sheets", "notes"];

export const PAGE_LABELS: Record<PageKey, string> = {
  home: "Home",
  inbox: "Inbox",
  "my-tasks": "My tasks",
  docs: "Docs",
  sheets: "Sheets",
  notes: "Notes",
};

export const DEFAULT_INTRO: Record<PageKey, string> = {
  home: "Your day at a glance, and a quick way to ask Claude about everything in Jefi Records.",
  inbox: "Mentions, assignments and comments on your tasks show up here.",
  "my-tasks": "Everything assigned to you, across all of your projects.",
  docs: "Keep your Google Doc links in one place. Rename them here, and open them inside Jefi Records or in Google. You can change the default in Settings.",
  sheets:
    "Keep your Google Sheet links in one place. Rename them here, and open them inside Jefi Records or in Google. You can change the default in Settings.",
  notes: "Write anything. Notes are private until you share one.",
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

/* The blocks on the Home page that can each be turned on or off. */
export type HomeSection = "claude" | "tasks" | "calendar" | "inbox" | "quick";

export const HOME_SECTIONS: HomeSection[] = ["claude", "tasks", "calendar", "inbox", "quick"];

export const HOME_LABELS: Record<HomeSection, string> = {
  claude: "Ask Claude",
  tasks: "Due today and overdue",
  calendar: "Today's calendar",
  inbox: "Unread Inbox",
  quick: "Quick add and recent",
};

/* Pages that can carry a personal header image and icon. */
export type CoverPageKey = PageKey | "settings";

export const COVER_PAGE_KEYS: CoverPageKey[] = [...PAGE_KEYS, "settings"];

export type PageIcon = { imageUrl: string | null; emoji: string | null };

/* How the Docs and Sheets pages are laid out, per person. */
export type LinkView = "list" | "gallery";
export type LinkSort = "custom" | "name" | "added" | "opened" | "review";
export type LinkGroup = "none" | "section" | "tag" | "person";
export type LinkViewPrefs = { view: LinkView; sort: LinkSort; group: LinkGroup };
export const DEFAULT_LINK_VIEW: LinkViewPrefs = { view: "list", sort: "custom", group: "section" };

export type Personal = {
  home: Record<HomeSection, boolean>;
  sidebar: Record<PageKey, boolean>;
  intro: Partial<Record<PageKey, string>>;
  music: Music;
  covers: Partial<Record<CoverPageKey, Cover>>;
  icons: Partial<Record<CoverPageKey, PageIcon>>;
  links: { doc: LinkViewPrefs; sheet: LinkViewPrefs };
};

export const DEFAULT_MUSIC: Music = {
  kind: "none",
  showPlayer: false,
  loop: true,
  autoplay: true,
};

export const DEFAULT_PERSONAL: Personal = {
  home: { claude: true, tasks: true, calendar: true, inbox: true, quick: true },
  sidebar: { home: true, inbox: true, "my-tasks": true, docs: true, sheets: true, notes: true },
  intro: {},
  music: DEFAULT_MUSIC,
  covers: {},
  icons: {},
  links: { doc: DEFAULT_LINK_VIEW, sheet: DEFAULT_LINK_VIEW },
};

function parseLinkView(raw: unknown): LinkViewPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = <T extends string>(v: unknown, opts: readonly T[], d: T): T =>
    opts.includes(v as T) ? (v as T) : d;
  return {
    view: pick(r.view, ["list", "gallery"] as const, DEFAULT_LINK_VIEW.view),
    sort: pick(r.sort, ["custom", "name", "added", "opened", "review"] as const, DEFAULT_LINK_VIEW.sort),
    group: pick(r.group, ["none", "section", "tag", "person"] as const, DEFAULT_LINK_VIEW.group),
  };
}

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
  const hm = (r.home && typeof r.home === "object" ? r.home : {}) as Record<string, unknown>;
  const intro = (r.intro && typeof r.intro === "object" ? r.intro : {}) as Record<string, unknown>;
  const m = (r.music && typeof r.music === "object" ? r.music : {}) as Record<string, unknown>;

  const sidebar = { ...DEFAULT_PERSONAL.sidebar };
  for (const k of PAGE_KEYS) sidebar[k] = sb[k] !== false;

  const home = { ...DEFAULT_PERSONAL.home };
  for (const k of HOME_SECTIONS) home[k] = hm[k] !== false;

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

  const rc = (r.covers && typeof r.covers === "object" ? r.covers : {}) as Record<string, unknown>;
  const ri = (r.icons && typeof r.icons === "object" ? r.icons : {}) as Record<string, unknown>;
  const covers: Partial<Record<CoverPageKey, Cover>> = {};
  const icons: Partial<Record<CoverPageKey, PageIcon>> = {};
  for (const k of COVER_PAGE_KEYS) {
    const c = parseCover(rc[k]);
    if (c) covers[k] = c;
    const i = (ri[k] && typeof ri[k] === "object" ? ri[k] : null) as Record<string, unknown> | null;
    if (i) {
      const imageUrl = typeof i.imageUrl === "string" ? i.imageUrl : null;
      const emoji = typeof i.emoji === "string" && i.emoji ? i.emoji.slice(0, 16) : null;
      if (imageUrl || emoji) icons[k] = { imageUrl, emoji: imageUrl ? null : emoji };
    }
  }

  const rl = (r.links && typeof r.links === "object" ? r.links : {}) as Record<string, unknown>;
  const links = { doc: parseLinkView(rl.doc), sheet: parseLinkView(rl.sheet) };

  return { home, sidebar, intro: outIntro, music, covers, icons, links };
}
