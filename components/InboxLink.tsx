"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/* Sidebar link to the inbox with a live count of unread notifications. The
   count also goes on the home screen icon where the device allows it. */
export default function InboxLink({
  meId,
  active,
  onNavigate,
}: {
  meId: string;
  active: boolean;
  onNavigate: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", meId)
      .is("read_at", null);
    setUnread(count ?? 0);
  }, [supabase, meId]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    const channel = supabase
      .channel(`inbox-count-${meId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${meId}`,
        },
        () => load()
      )
      .subscribe();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      supabase.removeChannel(channel);
    };
  }, [supabase, meId, load]);

  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    try {
      if (unread > 0) void nav.setAppBadge?.(unread)?.catch(() => {});
      else void nav.clearAppBadge?.()?.catch(() => {});
    } catch {
      /* Badges are optional. */
    }
  }, [unread]);

  return (
    <Link
      href="/inbox"
      onClick={onNavigate}
      className={`mb-1 flex items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-current/10 ${
        active ? "bg-current/10 font-medium" : ""
      }`}
    >
      <span>Inbox</span>
      {unread > 0 && (
        <span
          aria-label={`${unread} unread`}
          className="min-w-5 rounded-full bg-accent px-1.5 py-0.5 text-center text-xs font-medium leading-none text-white"
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
