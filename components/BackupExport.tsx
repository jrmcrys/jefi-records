"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/* Downloads everything this person can see as one JSON file: a plain copy
   they can keep, search, or import elsewhere. Reads go through the normal
   access rules, so private projects of the other person are never included. */

const PAGE = 1000;

const TABLES: { name: string; columns: string; order: string }[] = [
  { name: "projects", columns: "*", order: "created_at" },
  { name: "project_statuses", columns: "*", order: "position" },
  { name: "sections", columns: "*", order: "position" },
  { name: "tasks", columns: "*", order: "created_at" },
  { name: "field_definitions", columns: "*", order: "position" },
  { name: "task_field_values", columns: "*", order: "task_id" },
  { name: "tags", columns: "*", order: "name" },
  { name: "task_tags", columns: "*", order: "task_id" },
  { name: "comments", columns: "*", order: "created_at" },
  { name: "saved_views", columns: "*", order: "created_at" },
  { name: "profiles", columns: "id,name,email", order: "name" },
];

export default function BackupExport() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function download() {
    setBusy(true);
    setFailed(false);
    setMessage(null);
    try {
      const supabase = createClient();
      const out: Record<string, unknown[]> = {};
      for (const t of TABLES) {
        const rows: unknown[] = [];
        for (let from = 0; ; from += PAGE) {
          const { data, error } = await supabase
            .from(t.name)
            .select(t.columns)
            .order(t.order)
            .range(from, from + PAGE - 1);
          if (error) throw new Error(`${t.name}: ${error.message}`);
          rows.push(...(data ?? []));
          if (!data || data.length < PAGE) break;
        }
        out[t.name] = rows;
      }
      const file = {
        app: "Jefi Records",
        exported_at: new Date().toISOString(),
        ...out,
      };
      const blob = new Blob([JSON.stringify(file, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `jefi-records-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(
        `Saved ${out.tasks.length} tasks across ${out.projects.length} projects.`
      );
    } catch (e) {
      setFailed(true);
      setMessage(e instanceof Error ? e.message : "The export did not finish.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold">Back up your data</h2>
      <p className="mt-1 text-sm opacity-70">
        Download every project, task, comment and tag you can see as one file.
        Private projects of the other person are not included.
      </p>
      <button
        type="button"
        onClick={download}
        disabled={busy}
        className="mt-3 rounded-md border border-current/30 px-3 py-2 text-sm font-medium hover:bg-current/5 disabled:opacity-60"
      >
        {busy ? "Preparing..." : "Download backup"}
      </button>
      {message && (
        <p
          role={failed ? "alert" : "status"}
          className={`mt-2 text-sm ${failed ? "text-red-500" : "opacity-80"}`}
        >
          {message}
        </p>
      )}
    </section>
  );
}
