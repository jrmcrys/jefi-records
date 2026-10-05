"use client";

import { useEffect, useState } from "react";
import {
  currentSubscription,
  disablePush,
  enablePush,
  needsHomeScreenInstall,
  pushSupported,
} from "@/lib/push";
import type { NotifyPrefs } from "@/lib/google";

const GROUPS: { key: keyof NotifyPrefs; title: string; hint: string }[] = [
  { key: "mentions", title: "Mentions", hint: "Someone mentions you in a comment." },
  { key: "assigned", title: "Assignments", hint: "Someone assigns a task to you." },
  {
    key: "tags",
    title: "Followed tags",
    hint: "A tag you follow is added to a task, or a task with that tag gets a comment.",
  },
  {
    key: "comments",
    title: "Comments on my tasks",
    hint: "Someone comments on a task assigned to you.",
  },
];

type PushState = "checking" | "unsupported" | "install" | "off" | "on";

export default function NotificationSettings({
  userId,
  notify,
  onChange,
}: {
  userId: string;
  notify: NotifyPrefs;
  onChange: (next: NotifyPrefs) => void;
}) {
  const [push, setPush] = useState<PushState>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      let next: PushState;
      if (needsHomeScreenInstall()) next = "install";
      else if (!pushSupported()) next = "unsupported";
      else {
        const sub = await currentSubscription().catch(() => null);
        next = sub && Notification.permission === "granted" ? "on" : "off";
      }
      if (!cancelled) setPush(next);
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      if (push === "on") {
        await disablePush();
        setPush("off");
      } else {
        await enablePush(userId);
        setPush("on");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
    setBusy(false);
  }

  return (
    <section className="mt-8">
      <h2 className="text-sm font-medium">Notifications</h2>
      <p className="mt-1 text-xs opacity-60">
        New items always appear in your Inbox. Turn on push to also get a banner
        on this device, even when the app is closed.
      </p>

      <div className="mt-3 rounded-lg border border-current/15 p-3">
        {push === "checking" && <p className="text-sm opacity-60">Checking this device...</p>}
        {push === "unsupported" && (
          <p className="text-sm opacity-70">
            This browser does not support push notifications. Chrome, Edge, Firefox,
            and Safari 16 or newer on Mac do.
          </p>
        )}
        {push === "install" && (
          <p className="text-sm opacity-70">
            On iPhone, push works once Jefi Records is on your Home Screen. In
            Safari, tap Share, then Add to Home Screen, open it from there, and
            come back to this page.
          </p>
        )}
        {(push === "off" || push === "on") && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">
                Push on this device: {push === "on" ? "On" : "Off"}
              </p>
              <p className="text-xs opacity-60">
                Each device you use needs to be turned on once.
              </p>
            </div>
            <button
              type="button"
              onClick={toggle}
              disabled={busy}
              className="rounded-md border border-current/30 px-3 py-2 text-sm hover:bg-current/5 disabled:opacity-60"
            >
              {push === "on" ? "Turn off" : "Turn on"}
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-500">
            {error}
          </p>
        )}
      </div>

      <div className="mt-4 space-y-2">
        <p className="text-sm font-medium">What to notify me about</p>
        {GROUPS.map((g) => (
          <label key={g.key} className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={notify[g.key]}
              onChange={(e) => onChange({ ...notify, [g.key]: e.target.checked })}
              className="mt-1 size-4 accent-accent"
            />
            <span>
              <span className="block text-sm">{g.title}</span>
              <span className="block text-xs opacity-60">{g.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}
