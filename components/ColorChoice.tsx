"use client";

import { HEX_COLOR, PRESET_COLORS } from "@/lib/colors";

export default function ColorChoice({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Use color ${c}`}
          aria-pressed={value.toLowerCase() === c}
          onClick={() => onChange(c)}
          className={`size-6 rounded-full border-2 ${
            value.toLowerCase() === c ? "border-current" : "border-transparent"
          }`}
          style={{ backgroundColor: c }}
        />
      ))}
      <input
        key={value}
        defaultValue={value}
        aria-label="Hex color"
        maxLength={7}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (HEX_COLOR.test(v) && v.toLowerCase() !== value.toLowerCase()) onChange(v);
          else e.target.value = value;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="w-24 rounded-md border border-current/20 bg-transparent px-2 py-1 text-xs outline-none focus:border-current/50"
      />
    </div>
  );
}
