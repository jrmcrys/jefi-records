"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { parseGoogleFile } from "@/lib/google";
import LinkIcon from "./LinkIcon";

type Row = { id: string; kind: "doc" | "sheet"; title: string; url: string; emoji: string | null; image_url: string | null };

/* Docs and Sheets attached to this task from the Docs or Sheets page. Shows
   nothing when there are none. */
export default function TaskLinks({ taskId }: { taskId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("google_links")
      .select("id,kind,title,url,emoji,image_url")
      .eq("task_id", taskId)
      .eq("archived", false)
      .order("created_at")
      .then(({ data }) => {
        if (!cancelled) setRows((data ?? []) as Row[]);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, taskId]);

  if (rows.length === 0) return null;

  return (
    <section aria-label="Linked docs and sheets" className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide opacity-60">Docs and Sheets</h3>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-2 text-sm">
            <LinkIcon url={r.url} imageUrl={r.image_url} emoji={r.emoji} size={18} />
            <a
              href={parseGoogleFile(r.url)?.url ?? r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 flex-1 truncate hover:underline"
            >
              {r.title}
            </a>
            <Link href={r.kind === "doc" ? "/docs" : "/sheets"} className="text-xs opacity-60 hover:underline">
              {r.kind === "doc" ? "Docs" : "Sheets"}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
