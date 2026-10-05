"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile, Project, Visibility } from "@/lib/types";
import Avatar from "./Avatar";
import Menu, { MenuItem } from "./Menu";
import InboxLink from "./InboxLink";
import ProjectImage from "./ProjectImage";
import MusicPlayer from "./MusicPlayer";
import { usePersonal } from "./PersonalProvider";

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

/* Sidebar width on a computer. Each device keeps its own, in localStorage.
   The saved value is applied before the page paints by the script in
   app/(app)/layout.tsx, so there is no jump on load. */
export const SIDEBAR_MIN = 200;
export const SIDEBAR_MAX = 420;
export const SIDEBAR_DEFAULT = 288;
const WIDTH_KEY = "jefi:sidebar-width";
const COLLAPSED_KEY = "jefi:sidebar-collapsed";

function applySidebar(width: number, collapsed: boolean) {
  const root = document.documentElement;
  root.style.setProperty("--sb-w", `${width}px`);
  if (collapsed) root.setAttribute("data-sb-collapsed", "");
  else root.removeAttribute("data-sb-collapsed");
}

function useSidebarSize() {
  const [width, setWidth] = useState(SIDEBAR_DEFAULT);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const w = Number(window.localStorage.getItem(WIDTH_KEY));
      const c = window.localStorage.getItem(COLLAPSED_KEY) === "1";
      /* eslint-disable react-hooks/set-state-in-effect -- reading this device's saved size once */
      if (w >= SIDEBAR_MIN && w <= SIDEBAR_MAX) setWidth(w);
      setCollapsed(c);
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      /* storage blocked: keep the default */
    }
  }, []);

  function save(nextWidth: number, nextCollapsed: boolean) {
    applySidebar(nextWidth, nextCollapsed);
    try {
      window.localStorage.setItem(WIDTH_KEY, String(nextWidth));
      window.localStorage.setItem(COLLAPSED_KEY, nextCollapsed ? "1" : "0");
    } catch {
      /* the size still applies for this visit */
    }
  }

  return {
    width,
    collapsed,
    /** Live update while dragging, without saving. */
    preview(w: number) {
      const clamped = Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w)));
      setWidth(clamped);
      applySidebar(clamped, collapsed);
      return clamped;
    },
    setWidth(w: number) {
      const clamped = Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w)));
      setWidth(clamped);
      save(clamped, collapsed);
    },
    setCollapsed(c: boolean) {
      setCollapsed(c);
      save(width, c);
    },
  };
}

function SidebarIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2" />
      <path d="M6 3v10" />
    </svg>
  );
}

function Brand({ size }: { size: number }) {
  const { branding } = usePersonal();
  return (
    <span className="flex min-w-0 items-center gap-2">
      {branding.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={branding.logoUrl}
          alt=""
          className="shrink-0 rounded-md object-contain"
          style={{ width: size, height: size }}
        />
      )}
      <span className="truncate font-semibold tracking-tight">Jefi Records</span>
    </span>
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
  const { personal } = usePersonal();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [error, setError] = useState<string | null>(null);
  const sidebar = useSidebarSize();
  const dragRef = useRef<{ x: number; w: number } | null>(null);

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

  /* Remember which projects were opened last, for the Recent list on Home. */
  useEffect(() => {
    const match = /^\/p\/([^/]+)/.exec(pathname);
    if (!match) return;
    try {
      const key = "jefi:recent-projects";
      const ids = JSON.parse(window.localStorage.getItem(key) ?? "[]") as string[];
      const next = [match[1], ...ids.filter((id) => id !== match[1])].slice(0, 12);
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* recent projects are a convenience only */
    }
  }, [pathname]);

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
        <Brand size={26} />
      </header>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      <button
        type="button"
        aria-label="Show sidebar"
        title="Show sidebar"
        onClick={() => sidebar.setCollapsed(false)}
        className="sb-expand fixed left-3 top-3 z-40 hidden size-8 items-center justify-center rounded-md border border-current/15 bg-background opacity-70 shadow-sm hover:opacity-100"
      >
        <SidebarIcon />
      </button>

      <aside
        id="app-sidebar"
        style={{ color: "var(--sidebar-fg, var(--foreground))" }}
        className={`sb-aside fixed inset-y-0 left-0 z-50 flex w-72 shrink-0 flex-col border-r border-current/10 bg-sidebar p-4 transition-transform md:sticky md:top-0 md:h-screen md:w-(--sb-w,18rem) md:translate-x-0 ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 text-lg">
            <Brand size={30} />
          </span>
          <button
            type="button"
            aria-label="Hide sidebar"
            aria-controls="app-sidebar"
            title="Hide sidebar"
            onClick={() => sidebar.setCollapsed(true)}
            className="hidden size-8 shrink-0 items-center justify-center rounded-md opacity-50 hover:bg-current/10 hover:opacity-100 md:flex"
          >
            <SidebarIcon />
          </button>
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
          {personal.sidebar.home && (
            <Link
              href="/home"
              onClick={() => setDrawerOpen(false)}
              className={`mb-3 flex items-center rounded-md px-2 py-2 text-sm hover:bg-current/10 ${
                pathname === "/home" ? "nav-active font-medium" : ""
              }`}
            >
              Home
            </Link>
          )}
          <p className="px-2 text-xs font-medium uppercase tracking-wide opacity-50">
            Projects
          </p>
          <ul className="mt-2 space-y-0.5">
            {active.map((p, index) => {
              const isActive = pathname === `/p/${p.id}`;
              return (
                <li
                  key={p.id}
                  className={`flex items-center rounded-md hover:bg-current/10 ${
                    isActive ? "nav-active" : ""
                  }`}
                >
                  <Link
                    href={`/p/${p.id}`}
                    onClick={() => setDrawerOpen(false)}
                    className={`flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-sm ${
                      isActive ? "font-medium" : ""
                    }`}
                  >
                    <ProjectImage
                      name={p.name}
                      imageUrl={p.image_url}
                      emoji={p.emoji}
                      size={20}
                    />
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

          {(["inbox", "my-tasks", "docs", "sheets", "notes"] as const).some((k) => personal.sidebar[k]) && (
            <div className="mt-5 border-t border-current/10 pt-3">
              {personal.sidebar.inbox && (
                <InboxLink
                  meId={me.id}
                  active={pathname === "/inbox"}
                  onNavigate={() => setDrawerOpen(false)}
                />
              )}
              {(
                [
                  ["my-tasks", "/my-tasks", "My tasks"],
                  ["docs", "/docs", "Docs"],
                  ["sheets", "/sheets", "Sheets"],
                  ["notes", "/notes", "Notes"],
                ] as const
              )
                .filter(([key]) => personal.sidebar[key])
                .map(([key, href, text]) => (
                  <Link
                    key={key}
                    href={href}
                    onClick={() => setDrawerOpen(false)}
                    className={`mb-1 flex items-center rounded-md px-2 py-2 text-sm hover:bg-current/10 ${
                      pathname === href ? "nav-active font-medium" : ""
                    }`}
                  >
                    {text}
                  </Link>
                ))}
            </div>
          )}

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
              pathname === "/settings" ? "nav-active" : ""
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

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Sidebar width. Drag, or use the left and right arrow keys. Double-click to reset."
          aria-controls="app-sidebar"
          aria-valuemin={SIDEBAR_MIN}
          aria-valuemax={SIDEBAR_MAX}
          aria-valuenow={sidebar.width}
          tabIndex={0}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            dragRef.current = { x: e.clientX, w: sidebar.width };
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
          }}
          onPointerMove={(e) => {
            const d = dragRef.current;
            if (d) sidebar.preview(d.w + e.clientX - d.x);
          }}
          onPointerUp={(e) => {
            const d = dragRef.current;
            if (!d) return;
            dragRef.current = null;
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            sidebar.setWidth(d.w + e.clientX - d.x);
          }}
          onPointerCancel={() => {
            dragRef.current = null;
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
          }}
          onDoubleClick={() => sidebar.setWidth(SIDEBAR_DEFAULT)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") sidebar.setWidth(sidebar.width - 16);
            else if (e.key === "ArrowRight") sidebar.setWidth(sidebar.width + 16);
            else if (e.key === "Home") sidebar.setWidth(SIDEBAR_MIN);
            else if (e.key === "End") sidebar.setWidth(SIDEBAR_MAX);
            else return;
            e.preventDefault();
          }}
          className="absolute inset-y-0 -right-1 z-10 hidden w-2 cursor-col-resize touch-none md:block after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:bg-transparent hover:after:bg-accent/60 focus-visible:after:bg-accent"
        />
      </aside>

      <main className="sb-main min-w-0 flex-1">{children}</main>
      <MusicPlayer />
    </div>
  );
}
