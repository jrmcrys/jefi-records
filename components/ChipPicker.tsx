"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Chip = { id: string; name: string; color: string };

function readable(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#171717";
  const n = parseInt(m[1], 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const lum =
    0.2126 * lin((n >> 16) & 255) +
    0.7152 * lin((n >> 8) & 255) +
    0.0722 * lin(n & 255);
  return lum > 0.4 ? "#171717" : "#ffffff";
}

export function ChipBadge({ chip }: { chip: Chip }) {
  return (
    <span
      className="inline-flex max-w-full items-center truncate rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: chip.color, color: readable(chip.color) }}
    >
      <span className="truncate">{chip.name}</span>
    </span>
  );
}

export default function ChipPicker({
  label,
  options,
  selected,
  single,
  onToggle,
  onCreate,
  onManage,
  createLabel = "Create",
  emptyLabel = "None",
}: {
  label: string;
  options: Chip[];
  selected: string[];
  single?: boolean;
  onToggle: (id: string) => void;
  onCreate?: (name: string) => void | Promise<void>;
  onManage?: () => void;
  createLabel?: string;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const btn = buttonRef.current;
    const pop = popRef.current;
    if (!btn || !pop) return;
    const rect = btn.getBoundingClientRect();
    const width = pop.offsetWidth;
    const height = pop.offsetHeight;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    let top = rect.bottom + 4;
    if (top + height > window.innerHeight - 8) {
      top = Math.max(8, rect.top - height - 4);
    }
    setPos({ left, top });
  }, []);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(place);
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place, options.length]);

  const chosen = options.filter((o) => selected.includes(o.id));
  const q = query.trim().toLowerCase();
  const shown = q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options;
  const exact = options.some((o) => o.name.toLowerCase() === q);

  return (
    <div className="relative w-full">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setQuery("");
          setOpen((o) => !o);
        }}
        className="flex min-h-8 w-full flex-wrap items-center gap-1 rounded-md px-1.5 py-1 text-left text-sm hover:bg-current/10"
      >
        {chosen.length === 0 ? (
          <span className="px-0.5 opacity-40">{emptyLabel}</span>
        ) : (
          chosen.map((c) => <ChipBadge key={c.id} chip={c} />)
        )}
      </button>

      {open && (
        <div
          ref={popRef}
          role="listbox"
          aria-label={label}
          aria-multiselectable={!single}
          style={{
            position: "fixed",
            left: pos?.left ?? 0,
            top: pos?.top ?? 0,
            visibility: pos ? "visible" : "hidden",
          }}
          className="z-[90] w-60 max-w-[calc(100vw-1rem)] rounded-lg border border-current/20 bg-background p-2 shadow-xl"
        >
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && onCreate && q && !exact) {
                e.preventDefault();
                void onCreate(query.trim());
                setQuery("");
              }
            }}
            placeholder={onCreate ? "Search or create" : "Search"}
            aria-label="Search"
            className="mb-2 w-full rounded-md border border-current/20 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-current/50"
          />
          <ul className="max-h-56 space-y-0.5 overflow-y-auto">
            {single && (
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected.length === 0}
                  onClick={() => {
                    if (selected[0]) onToggle(selected[0]);
                    setOpen(false);
                  }}
                  className="flex w-full items-center rounded px-2 py-1.5 text-left text-sm opacity-70 hover:bg-current/10"
                >
                  None
                </button>
              </li>
            )}
            {shown.map((o) => {
              const on = selected.includes(o.id);
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => {
                      onToggle(o.id);
                      if (single) setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-current/10"
                  >
                    <span
                      aria-hidden="true"
                      className="flex size-4 shrink-0 items-center justify-center rounded border border-current/30 text-[10px]"
                    >
                      {on ? "✓" : ""}
                    </span>
                    <ChipBadge chip={o} />
                  </button>
                </li>
              );
            })}
            {shown.length === 0 && !(onCreate && q) && (
              <li className="px-2 py-1.5 text-sm opacity-60">Nothing found.</li>
            )}
          </ul>
          {onCreate && q && !exact && (
            <button
              type="button"
              onClick={() => {
                void onCreate(query.trim());
                setQuery("");
              }}
              className="mt-1 flex w-full items-center rounded px-2 py-1.5 text-left text-sm hover:bg-current/10"
            >
              {createLabel} &quot;{query.trim()}&quot;
            </button>
          )}
          {onManage && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onManage();
              }}
              className="mt-1 w-full border-t border-current/10 px-2 pt-2 text-left text-xs underline opacity-70 hover:opacity-100"
            >
              Edit colors and names
            </button>
          )}
        </div>
      )}
    </div>
  );
}
