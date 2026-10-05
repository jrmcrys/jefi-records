/* Where to send someone after they sign in. Only same-site paths are allowed,
   so a crafted link cannot bounce a person to another website. */
export const NEXT_COOKIE = "jefi_next";

export function safeNext(raw: string | null | undefined): string {
  if (!raw) return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  if (raw.startsWith("/login") || raw.startsWith("/auth")) return "/";
  return raw;
}

/* Reads the remembered destination from its cookie. */
export function nextFromCookie(raw: string | null | undefined): string {
  if (!raw) return "/";
  try {
    return safeNext(decodeURIComponent(raw));
  } catch {
    return safeNext(raw);
  }
}
