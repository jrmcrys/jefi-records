"use client";

import { useState } from "react";

export default function AddInline({
  placeholder,
  onAdd,
  onCancel,
  autoFocus,
  className = "",
}: {
  placeholder: string;
  onAdd: (name: string) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
  className?: string;
}) {
  const [value, setValue] = useState("");

  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const name = value.trim();
        if (!name) return;
        onAdd(name);
        setValue("");
      }}
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel?.();
        }}
        onBlur={() => {
          if (!value.trim()) onCancel?.();
        }}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-md bg-transparent px-2 py-2 text-sm outline-none placeholder:opacity-50 focus:bg-current/5"
      />
    </form>
  );
}
