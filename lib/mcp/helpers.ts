/* Small conversions used by the Claude connector. */

export const DEFAULT_TZ = "Asia/Manila";
const DEFAULT_OFFSET = "+08:00";

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

export function plainText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<\/(p|li|ul|ol)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type Person = { id: string; name: string };

/* Plain text in, the same HTML the app's editor stores out. Writing @Name for
   a known person turns into a real mention and is reported in `mentions`. */
export function htmlFromText(
  text: string,
  people: Person[] = []
): { html: string; mentions: string[] } {
  const mentions = new Set<string>();
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const html = paragraphs
    .map((p) => {
      let out = escapeHtml(p).replace(/\n/g, "<br>");
      for (const person of people) {
        const re = new RegExp(`@${escapeRegex(escapeHtml(person.name))}(?![\\w])`, "gi");
        out = out.replace(re, () => {
          mentions.add(person.id);
          const label = escapeHtml(person.name);
          return `<span class="mention" data-type="mention" data-id="${person.id}" data-label="${label}">@${label}</span>`;
        });
      }
      return `<p>${out}</p>`;
    })
    .join("");

  return { html, mentions: [...mentions] };
}

/* A date such as 2026-10-12 means "that day, no time". A date and time must
   carry an offset (Z or +08:00); without one, Philippine time is assumed. */
export function parseDue(
  input: string
): { due_at: string; due_has_time: boolean } | { error: string } {
  const value = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(`${value}T12:00:00.000Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
      return { error: `"${input}" is not a real calendar date.` };
    }
    return { due_at: d.toISOString(), due_has_time: false };
  }
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/i.test(value)) {
    const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(value);
    const d = new Date(hasZone ? value.replace(" ", "T") : `${value.replace(" ", "T")}${DEFAULT_OFFSET}`);
    if (Number.isNaN(d.getTime())) return { error: `"${input}" is not a valid date and time.` };
    return { due_at: d.toISOString(), due_has_time: true };
  }
  return { error: `Use YYYY-MM-DD, or YYYY-MM-DDTHH:MM with an offset such as +08:00 (got "${input}").` };
}

export function sanitizeSearch(q: string): string {
  return q.replace(/[,()*%\\"':]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}
