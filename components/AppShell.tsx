"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile, Project, Visibility } from "@/lib/types";
import Avatar from "./Avatar";
import Menu, { MenuItem } from "./Menu";
import InboxLink from "./InboxLink";

function LockIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-label="Private project"
      role="img"
      className="shrink-0 opacity-60"
    >
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  );
}

export default function AppShell({
  me,
  projects,
  children,
}: {
  me: Profile;
  projects: Project[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [error, setError] = useState<string | null>(null);

  const active = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("shell-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "projects" },
        () => router.refresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        () => router.refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  async function addProject(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    const supabase = createClient();
    const position =
      projects.reduce((max, p) => Math.max(max, p.position), 0) + 1000;
    const { data, error } = await supabase
      .from("projects")
      .insert({ name: trimmed, position, visibility })
      .select("id")
      .single();
    if (error || !data) {
      setError(error?.message ?? "Could not create the project.");
      return;
    }
    setName("");
    setDrawerOpen(false);
    router.push(`/p/${data.id}`);
    router.refresh();
  }

  async function restoreProject(id: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from("projects")
      .update({ archived: false })
      .eq("id", id);
    if (error) setError(error.message);
    else router.refresh();
  }

  async function deleteProjectForever(p: Project) {
    const typed = window.prompt(
      `This permanently deletes "${p.name}" with all of its tasks, comments and files. It cannot be undone.\n\nType the project name to confirm.`
    );
    if (typed === null) return;
    if (typed.trim() !== p.name.trim()) {
      setError("The name did not match, so nothing was deleted.");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.from("projects").delete().eq("id", p.id);
    if (error) setError(error.message);
    else {
      setError(null);
      router.refresh();
    }
  }

  async function moveProject(id: string, dir: -1 | 1) {
    const i = active.findIndex((p) => p.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= active.length) return;
    const next = [...active];
    [next[i], next[j]] = [next[j], next[i]];
    const supabase = createClient();
    const { error } = await supabase.from("project_prefs").upsert(
      next.map((p, index) => ({
        user_id: me.id,
        project_id: p.id,
        position: (index + 1) * 1000,
      })),
      { onConflict: "user_id,project_id" }
    );
    if (error) setError(error.message);
    else router.refresh();
  }

  return (
    <div className="min-h-screen md:flex">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-current/10 bg-background px-4 py-3 md:hidden">
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setDrawerOpen(true)}
          className="flex size-9 items-center justify-center rounded-md border border-current/20 text-lg leading-none"
        >
          {"☰"}
        </button>
        <span className="font-semibold tracking-tight">Jefi Records</span>
      </header>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-current/10 bg-sidebar p-4 transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0 ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-lg font-semibold tracking-tight">
            Jefi Records
          </span>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            className="flex size-8 items-center justify-center rounded-md text-lg leading-none opacity-60 hover:bg-current/10 md:hidden"
          >
            {"×"}
          </button>
        </div>

        <nav className="mt-6 flex-1 overflow-y-auto" aria-label="Projects">
          <InboxLink
            meId={me.id}
            active={pathname === "/inbox"}
            onNavigate={() => setDrawerOpen(false)}
          />
          <Link
            href="/my-tasks"
            onClick={() => setDrawerOpen(false)}
            className={`mb-1 flex items-center rounded-md px-2 py-2 text-sm hover:bg-current/10 ${
              pathname === "/my-tasks" ? "bg-current/10 font-medium" : ""
            }`}
          >
            My tasks
          </Link>
          {(
            [
              ["/docs", "Docs"],
              ["/sheets", "Sheets"],
            ] as const
          ).map(([href, text]) => (
            <Link
              key={href}
              href={href}
              onClick={() => setDrawerOpen(false)}
              className={`mb-1 flex items-center rounded-md px-2 py-2 text-sm hover:bg-current/10 ${
                pathname === href ? "bg-current/10 font-medium" : ""
              }`}
            >
              {text}
            </Link>
          ))}
          <p className="mt-4 px-2 text-xs font-medium uppercase tracking-wide opacity-50">
            Projects
          </p>
          <ul className="mt-2 space-y-0.5">
            {active.map((p, index) => {
              const isActive = pathname === `/p/${p.id}`;
              return (
                <li
                  key={p.id}
                  className={`flex items-center rounded-md hover:bg-current/10 ${
                    isActive ? "bg-current/10" : ""
                  }`}
                >
                  <Link
                    href={`/p/${p.id}`}
                    onClick={() => setDrawerOpen(false)}
                    className={`flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-sm ${
                      isActive ? "font-medium" : ""
                    }`}
                  >
                    <span className="truncate">{p.name}</span>
                    {p.visibility === "private" && <LockIcon />}
                  </Link>
                  <Menu label={`Actions for ${p.name}`}>
                    <MenuItem
                      onClick={() => moveProject(p.id, -1)}
                      disabled={index === 0}
                    >
                      Move up
                    </MenuItem>
                    <MenuItem
                      onClick={() => moveProject(p.id, 1)}
                      disabled={index === active.length - 1}
                    >
                      Move down
                    </MenuItem>
                  </Menu>
                </li>
              );
            })}
            {active.length === 0 && (
              <li className="px-2 py-2 text-sm opacity-60">No projects yet.</li>
            )}
          </ul>

          <form onSubmit={addProject} className="mt-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New project"
              aria-label="New project name"
              className="w-full rounded-md border border-current/20 bg-transparent px-2 py-2 text-sm outline-none placeholder:opacity-50 focus:border-current/50"
            />
            {name.trim() && (
              <div className="mt-2 flex items-center gap-2">
                <div
                  role="radiogroup"
                  aria-label="Who can see this project"
                  className="flex flex-1 overflow-hidden rounded-md border border-current/20 text-xs"
                >
                  {(
                    [
                      ["public", "Shared with Effie and Jerome"],
                      ["private", "Only me"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={visibility === value}
                      onClick={() => setVisibility(value)}
                      className={`flex-1 px-2 py-1.5 ${
                        visibility === value
                          ? "bg-accent/15 font-medium"
                          : "opacity-70 hover:bg-current/10"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  type="submit"
                  className="rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-white"
                >
                  Create
                </button>
              </div>
            )}
          </form>
          {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

          {archived.length > 0 && (
            <details className="mt-6">
              <summary className="cursor-pointer px-2 text-xs font-medium uppercase tracking-wide opacity-50">
                Archived ({archived.length})
              </summary>
              <ul className="mt-2 space-y-0.5">
                {archived.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm"
                  >
                    <span className="truncate opacity-70">{p.name}</span>
                    {p.created_by === me.id && (
                      <span className="flex shrink-0 items-center gap-3">
                        <button
                          type="button"
                          onClick={() => restoreProject(p.id)}
                          className="text-xs underline opacity-70 hover:opacity-100"
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteProjectForever(p)}
                          className="text-xs text-red-500 underline opacity-80 hover:opacity-100"
                        >
                          Delete
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </nav>

        <div className="border-t border-current/10 pt-4">
          <Link
            href="/settings"
            onClick={() => setDrawerOpen(false)}
            className={`flex items-center gap-3 rounded-md px-2 py-2 hover:bg-current/10 ${
              pathname === "/settings" ? "bg-current/10" : ""
            }`}
          >
            <Avatar profile={me} size={32} />
            <span className="min-w-0">
              <span className="block truncate text-sm">{me.name}</span>
              <span className="block truncate text-xs opacity-60">
                Settings
              </span>
            </span>
          </Link>
          <form action="/auth/signout" method="post" className="mt-3">
            <button
              type="submit"
              className="w-full rounded-md border border-current/20 px-3 py-1.5 text-sm hover:border-current/50"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
