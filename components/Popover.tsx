"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export default function Popover({
  label,
  buttonClassName,
  trigger,
  width = 288,
  children,
}: {
  label: string;
  buttonClassName?: string;
  trigger: React.ReactNode;
  width?: number;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const btn = buttonRef.current;
    const pop = popRef.current;
    if (!btn || !pop) return;
    const rect = btn.getBoundingClientRect();
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - w - 8));
    let top = rect.bottom + 4;
    if (top + h > window.innerHeight - 8) {
      top = Math.max(8, Math.min(rect.top - h - 4, window.innerHeight - h - 8));
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
  }, [open, place]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className={
          buttonClassName ??
          "flex items-center gap-1.5 rounded-md border border-current/20 px-3 py-1.5 text-sm hover:border-current/50"
        }
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={popRef}
          role="dialog"
          aria-label={label}
          style={{
            position: "fixed",
            left: pos?.left ?? 0,
            top: pos?.top ?? 0,
            width,
            maxHeight: "min(70vh, 560px)",
            visibility: pos ? "visible" : "hidden",
          }}
          className="z-[70] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border border-current/20 bg-background p-3 text-sm shadow-xl"
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </>
  );
}
