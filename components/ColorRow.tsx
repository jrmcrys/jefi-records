"use client";

import { isHex } from "@/lib/theme";

/* One labelled color setting: native picker, hex box, and a Default button. */
export default function ColorRow({
  label,
  hint,
  value,
  fallback,
  isCustom,
  onChange,
  onClear,
  children,
}: {
  label: string;
  hint: string;
  value: string;
  fallback: string;
  isCustom: boolean;
  onChange: (hex: string) => void;
  onClear: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="border-b border-current/10 py-4 first:pt-0 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs opacity-60">{hint}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <input
            type="color"
            value={value}
            aria-label={`${label} color picker`}
            onChange={(e) => onChange(e.target.value)}
            className="size-9 cursor-pointer rounded-md border border-current/20 bg-transparent p-0.5"
          />
          <input
            key={value}
            defaultValue={value}
            aria-label={`${label} hex code`}
            maxLength={7}
            spellCheck={false}
            onBlur={(e) => {
              const v = e.target.value.trim();
              const hex = v.startsWith("#") ? v : `#${v}`;
              if (isHex(hex)) onChange(hex.toLowerCase());
              else e.target.value = value;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            className="w-24 rounded-md border border-current/20 bg-transparent px-2 py-2 font-mono text-xs outline-none focus:border-current/50"
          />
          <button
            type="button"
            onClick={onClear}
            disabled={!isCustom}
            title={`Back to default (${fallback})`}
            className="rounded-md px-2 py-2 text-xs underline opacity-70 hover:opacity-100 disabled:no-underline disabled:opacity-30"
          >
            Default
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}
