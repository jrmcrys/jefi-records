"use client";

import { useEffect, useRef, useState } from "react";
import Avatar from "./Avatar";
import type { Profile } from "@/lib/types";

export default function AssigneePicker({
  profiles,
  assignableIds,
  value,
  onChange,
}: {
  profiles: Profile[];
  assignableIds?: string[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = profiles.find((p) => p.id === value) ?? null;
  const options = assignableIds
    ? profiles.filter((p) => assignableIds.includes(p.id))
    : profiles;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={current ? `Assignee: ${current.name}` : "Assign to someone"}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md border border-current/20 px-1.5 py-1 text-xs hover:border-current/50"
      >
        <Avatar profile={current} size={20} />
        <span className="max-w-24 truncate">
          {current ? current.name : "Unassigned"}
        </span>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute left-0 z-30 mt-1 w-48 rounded-md border border-current/20 bg-background p-1 shadow-lg"
        >
          <li role="option" aria-selected={value === null}>
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-current/10"
            >
              <Avatar profile={null} size={22} />
              Unassigned
            </button>
          </li>
          {options.map((p) => (
            <li key={p.id} role="option" aria-selected={value === p.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(p.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-current/10 ${
                  value === p.id ? "bg-current/10 font-medium" : ""
                }`}
              >
                <Avatar profile={p} size={22} />
                <span className="truncate">{p.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
