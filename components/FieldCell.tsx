"use client";

import AssigneePicker from "./AssigneePicker";
import ChipPicker from "./ChipPicker";
import type { FieldDef, Profile } from "@/lib/types";

const input =
  "w-full min-w-0 rounded bg-transparent px-2 py-1.5 text-sm outline-none hover:bg-current/5 focus:bg-current/5";

function asHref(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const href = /^(https?:|mailto:)/i.test(v) ? v : `https://${v}`;
  try {
    const url = new URL(href);
    return url.protocol === "javascript:" ? null : url.toString();
  } catch {
    return null;
  }
}

export default function FieldCell({
  field,
  value,
  profiles,
  assignableIds,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  profiles: Profile[];
  assignableIds?: string[];
  onChange: (value: unknown) => void;
}) {
  switch (field.type) {
    case "text": {
      const text = typeof value === "string" ? value : "";
      return (
        <input
          key={`${field.id}:${text}`}
          defaultValue={text}
          aria-label={field.name}
          onBlur={(e) => {
            const v = e.target.value;
            if (v !== text) onChange(v === "" ? null : v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className={input}
        />
      );
    }
    case "number": {
      const num = typeof value === "number" ? String(value) : "";
      return (
        <input
          key={`${field.id}:${num}`}
          type="number"
          inputMode="decimal"
          defaultValue={num}
          aria-label={field.name}
          onBlur={(e) => {
            const raw = e.target.value.trim();
            const parsed = raw === "" ? null : Number(raw);
            if (parsed !== null && !Number.isFinite(parsed)) {
              e.target.value = num;
              return;
            }
            if (raw !== num) onChange(parsed);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className={input}
        />
      );
    }
    case "url": {
      const text = typeof value === "string" ? value : "";
      const href = asHref(text);
      return (
        <div className="flex w-full min-w-0 items-center">
          <input
            key={`${field.id}:${text}`}
            defaultValue={text}
            aria-label={field.name}
            placeholder="Paste a link"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== text) onChange(v === "" ? null : v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            className={`${input} placeholder:opacity-40`}
          />
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${field.name} link`}
              className="flex size-7 shrink-0 items-center justify-center rounded text-sm opacity-60 hover:bg-current/10 hover:opacity-100"
            >
              {"↗"}
            </a>
          )}
        </div>
      );
    }
    case "checkbox":
      return (
        <label className="flex items-center px-2 py-1.5">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
            aria-label={field.name}
            className="size-4 accent-accent"
          />
        </label>
      );
    case "dropdown": {
      const selected = typeof value === "string" ? [value] : [];
      return (
        <ChipPicker
          label={field.name}
          options={field.options}
          selected={selected}
          single
          emptyLabel="Choose"
          onToggle={(id) => onChange(selected[0] === id ? null : id)}
        />
      );
    }
    case "multi_select": {
      const selected = Array.isArray(value)
        ? value.filter((v): v is string => typeof v === "string")
        : [];
      return (
        <ChipPicker
          label={field.name}
          options={field.options}
          selected={selected}
          emptyLabel="Choose"
          onToggle={(id) => {
            const next = selected.includes(id)
              ? selected.filter((x) => x !== id)
              : [...selected, id];
            onChange(next.length ? next : null);
          }}
        />
      );
    }
    case "person":
      return (
        <AssigneePicker
          profiles={profiles}
          assignableIds={assignableIds}
          value={typeof value === "string" ? value : null}
          onChange={(id) => onChange(id)}
        />
      );
  }
}
