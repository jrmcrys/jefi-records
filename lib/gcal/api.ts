import { decryptToken } from "./crypto";

/* Small wrapper around the two Google endpoints this app uses. Server only. */

export class GoogleAuthError extends Error {
  constructor(
    public kind: "expired" | "scope" | "config",
    message: string
  ) {
    super(message);
  }
}

export type GoogleCalendar = {
  id: string;
  name: string;
  color: string;
  primary: boolean;
};

export type GoogleEvent = {
  id: string;
  status?: string;
  summary?: string;
  visibility?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
};

export async function accessTokenFor(stored: string): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new GoogleAuthError("config", "Google client is not configured");
  }
  let refresh: string;
  try {
    refresh = decryptToken(stored);
  } catch {
    throw new GoogleAuthError("expired", "Stored token cannot be read");
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new GoogleAuthError("expired", "Google no longer accepts this connection");
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new GoogleAuthError("expired", "Google returned no access token");
  }
  return json.access_token;
}

export async function revokeToken(stored: string): Promise<void> {
  try {
    const refresh = decryptToken(stored);
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refresh }),
      cache: "no-store",
    });
  } catch {
    /* Revoking is best effort. The stored copy is deleted either way. */
  }
}

async function googleGet<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (res.status === 401) {
    throw new GoogleAuthError("expired", "Google rejected the access token");
  }
  if (res.status === 403) {
    throw new GoogleAuthError("scope", "Calendar access was not granted");
  }
  if (!res.ok) {
    throw new Error(`Google Calendar request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function listCalendars(accessToken: string): Promise<GoogleCalendar[]> {
  const json = await googleGet<{
    items?: {
      id: string;
      summary?: string;
      summaryOverride?: string;
      backgroundColor?: string;
      primary?: boolean;
      accessRole?: string;
      selected?: boolean;
    }[];
  }>(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader&maxResults=250",
    accessToken
  );
  return (json.items ?? []).map((c) => ({
    id: c.id,
    name: c.summaryOverride || c.summary || c.id,
    color: /^#[0-9a-f]{6}$/i.test(c.backgroundColor ?? "")
      ? (c.backgroundColor as string)
      : "#4285f4",
    primary: Boolean(c.primary),
  }));
}

export async function listEvents(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string
): Promise<GoogleEvent[]> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "500",
    fields: "items(id,status,summary,visibility,start,end,attendees(self,responseStatus))",
  });
  const json = await googleGet<{ items?: GoogleEvent[] }>(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    accessToken
  );
  return json.items ?? [];
}
