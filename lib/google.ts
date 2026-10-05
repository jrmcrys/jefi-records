export type LinkKind = "doc" | "sheet";
export type LinkOpen = "embed" | "google";

export type NotifyPrefs = {
  mentions: boolean;
  assigned: boolean;
  tags: boolean;
  comments: boolean;
};

export type UserPrefs = {
  linkOpen: LinkOpen;
  showSharedCalendars: boolean;
  notify: NotifyPrefs;
};

export const DEFAULT_NOTIFY: NotifyPrefs = {
  mentions: true,
  assigned: true,
  tags: true,
  comments: true,
};

export const DEFAULT_PREFS: UserPrefs = {
  linkOpen: "embed",
  showSharedCalendars: true,
  notify: DEFAULT_NOTIFY,
};

export function parsePrefs(value: unknown): UserPrefs {
  if (!value || typeof value !== "object") return DEFAULT_PREFS;
  const v = value as Record<string, unknown>;
  const n = (v.notify && typeof v.notify === "object" ? v.notify : {}) as Record<string, unknown>;
  return {
    linkOpen: v.linkOpen === "google" ? "google" : "embed",
    showSharedCalendars: v.showSharedCalendars !== false,
    notify: {
      mentions: n.mentions !== false,
      assigned: n.assigned !== false,
      tags: n.tags !== false,
      comments: n.comments !== false,
    },
  };
}

export const KIND_LABELS: Record<LinkKind, { plural: string; singular: string; untitled: string; example: string }> = {
  doc: {
    plural: "Docs",
    singular: "Google Doc",
    untitled: "Untitled doc",
    example: "https://docs.google.com/document/d/...",
  },
  sheet: {
    plural: "Sheets",
    singular: "Google Sheet",
    untitled: "Untitled sheet",
    example: "https://docs.google.com/spreadsheets/d/...",
  },
};

export type ParsedLink =
  | { ok: true; id: string; url: string; embedUrl: string }
  | { ok: false; error: string };

/** Accepts a Google Docs or Sheets link and builds the address used to open
    it in the app. Only docs.google.com links are accepted, and the embedded
    address is always rebuilt from the file id. */
export function parseGoogleLink(kind: LinkKind, input: string): ParsedLink {
  const raw = input.trim();
  if (!raw) return { ok: false, error: "Paste a link first." };
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { ok: false, error: "That does not look like a link." };
  }
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com") {
    return {
      ok: false,
      error: `Use a ${KIND_LABELS[kind].singular} link that starts with docs.google.com.`,
    };
  }
  const segment = kind === "doc" ? "document" : "spreadsheets";
  const match = new RegExp(`/${segment}/(?:u/\\d+/)?d/([A-Za-z0-9_-]{10,})`).exec(url.pathname);
  if (!match) {
    return {
      ok: false,
      error: `That link is not a ${KIND_LABELS[kind].singular}. Open the file in Google and copy the address from the browser.`,
    };
  }
  const id = match[1];
  const base = `https://docs.google.com/${segment}/d/${id}`;
  return { ok: true, id, url: `${base}/edit`, embedUrl: `${base}/edit?usp=sharing` };
}

export function embedUrlFor(kind: LinkKind, storedUrl: string): string | null {
  const parsed = parseGoogleLink(kind, storedUrl);
  return parsed.ok ? parsed.embedUrl : null;
}

/* Any Google file link: Docs, Sheets, Slides, Forms or a Drive file. The
   Docs and Sheets pages accept all of them; the type decides the icon, the
   embed address, and which page a pasted link belongs on. */
export type GoogleFileType = "doc" | "sheet" | "slides" | "form" | "file";

export const FILE_TYPE_LABELS: Record<GoogleFileType, string> = {
  doc: "Google Doc",
  sheet: "Google Sheet",
  slides: "Google Slides",
  form: "Google Form",
  file: "Drive file",
};

export type GoogleFile = {
  type: GoogleFileType;
  id: string;
  /** Clean address that opens the file in Google. */
  url: string;
  /** Address used to show it inside Jefi Records. */
  embedUrl: string;
};

const SEGMENTS: [GoogleFileType, string][] = [
  ["doc", "document"],
  ["sheet", "spreadsheets"],
  ["slides", "presentation"],
  ["form", "forms"],
];

export function parseGoogleFile(input: string): GoogleFile | null {
  const raw = input.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.hostname === "docs.google.com") {
    for (const [type, segment] of SEGMENTS) {
      const m = new RegExp(`^/${segment}/(?:u/\\d+/)?d/(e/)?([A-Za-z0-9_-]{10,})`).exec(url.pathname);
      if (!m) continue;
      const id = m[2];
      if (type === "form") {
        const base = `https://docs.google.com/forms/d/${m[1] ? "e/" : ""}${id}`;
        return { type, id, url: `${base}/${m[1] ? "viewform" : "edit"}`, embedUrl: `${base}/viewform?embedded=true` };
      }
      const base = `https://docs.google.com/${segment}/d/${id}`;
      return { type, id, url: `${base}/edit`, embedUrl: `${base}/edit?usp=sharing` };
    }
    return null;
  }
  if (url.hostname === "drive.google.com") {
    const m = /^\/file\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{10,})/.exec(url.pathname);
    const id = m?.[1] ?? (url.pathname === "/open" ? url.searchParams.get("id") : null);
    if (!id || !/^[A-Za-z0-9_-]{10,}$/.test(id)) return null;
    const base = `https://drive.google.com/file/d/${id}`;
    return { type: "file", id, url: `${base}/view`, embedUrl: `${base}/preview` };
  }
  return null;
}

/* Which page a file type lives on when it is pasted. */
export function pageForType(type: GoogleFileType, current: LinkKind): LinkKind {
  if (type === "doc") return "doc";
  if (type === "sheet") return "sheet";
  return current;
}

/* A small preview picture from Google. It only loads when the browser is
   signed in to a Google account that can open the file. */
export function thumbnailUrl(file: GoogleFile, width = 480): string {
  return `https://drive.google.com/thumbnail?id=${file.id}&sz=w${width}`;
}

/* Pulls every Google link out of pasted text (one per line, or mixed in). */
export function findGoogleLinks(text: string): string[] {
  const found = text.match(/https?:\/\/(?:docs|drive)\.google\.com\/[^\s<>"')]+/g) ?? [];
  return Array.from(new Set(found));
}
