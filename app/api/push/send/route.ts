import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import webpush from "web-push";

export const dynamic = "force-dynamic";

/* Called by the database (through pg_net) whenever a notification row is
   created. The body carries the target device subscriptions and the message,
   so this route needs no database access of its own. A shared secret keeps
   anyone else from using it. */

type Subscription = { endpoint: string; p256dh: string; auth: string };

const PUSH_HOSTS = [
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.services.mozilla.com",
  "web.push.apple.com",
  "push.apple.com",
  "notify.windows.com",
];

function isPushServiceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    return PUSH_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function POST(request: NextRequest) {
  const secret = process.env.PUSH_WEBHOOK_SECRET;
  const given = request.headers.get("x-push-secret") ?? "";
  if (!secret || !sameSecret(secret, given)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    return NextResponse.json({ error: "Push is not configured" }, { status: 503 });
  }

  let body: {
    subscriptions?: Subscription[];
    title?: string;
    body?: string;
    url?: string;
    tag?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const subs = (body.subscriptions ?? [])
    .filter((s) => s && isPushServiceUrl(s.endpoint) && s.p256dh && s.auth)
    .slice(0, 10);
  if (subs.length === 0) return NextResponse.json({ sent: 0 });

  const url = typeof body.url === "string" && body.url.startsWith("/") && !body.url.startsWith("//")
    ? body.url
    : "/inbox";
  const payload = JSON.stringify({
    title: String(body.title ?? "Jefi Records").slice(0, 100),
    body: String(body.body ?? "").slice(0, 200),
    url,
    tag: body.tag ? String(body.tag).slice(0, 64) : undefined,
  });

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:jrmcrys.work@gmail.com",
    publicKey,
    privateKey
  );

  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        { TTL: 60 * 60 * 24 }
      )
    )
  );
  const sent = results.filter((r) => r.status === "fulfilled").length;
  return NextResponse.json({ sent, failed: results.length - sent });
}
