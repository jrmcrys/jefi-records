"use client";

import { useState } from "react";
import Popover from "./Popover";

export type HiddenOption = { key: string; label: string };

type Props = {
  label: string;
  colKey: string;
  /** Sticky offset in pixels when the column is pinned (or is the name). */
  left?: number;
  isName?: boolean;
  pinned: boolean;
  /** Direction this column is currently sorted in, if it is the sort column. */
  sortDir: "asc" | "desc" | null;
  canSort: boolean;
  canGroup: boolean;
  grouped: boolean;
  hiddenOptions: HiddenOption[];
  onSort: () => void;
  onGroup: () => void;
  onInsert: (side: "left" | "right", key: string | "new") => void;
  onFit: () => void;
  onPin: () => void;
  onMoveStart: () => void;
  onMoveEnd: () => void;
  onHide: () => void;
  onStart: (key: string, e: React.PointerEvent<HTMLDivElement>) => void;
  onMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onEnd: () => void;
  onKey: (key: string, e: React.KeyboardEvent<HTMLDivElement>) => void;
};

const item =
  "flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left hover:bg-current/10 disabled:opacity-40 disabled:hover:bg-transparent";

function MenuBody({
  props,
  close,
}: {
  props: Props;
  close: () => void;
}) {
  const [page, setPage] = useState<"main" | "left" | "right">("main");
  const p = props;
  const run = (fn: () => void) => () => {
    fn();
    close();
  };

  if (page !== "main") {
    return (
      <div>
        <button
          type="button"
          onClick={() => setPage("main")}
          className={`${item} mb-1 border-b border-current/10 rounded-b-none opacity-70`}
        >
          <span>{"‹ Back"}</span>
          <span className="text-xs">
            Insert {page === "left" ? "left" : "right"}
          </span>
        </button>
        {p.hiddenOptions.map((o) => (
          <button
            key={o.key}
            type="button"
            className={item}
            onClick={run(() => p.onInsert(page, o.key))}
          >
            Show {o.label}
          </button>
        ))}
        <button
          type="button"
          className={item}
          onClick={run(() => p.onInsert(page, "new"))}
        >
          New column
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        disabled={!p.canSort}
        className={item}
        onClick={run(p.onSort)}
      >
        <span>Sort</span>
        <span className="text-xs opacity-60">
          {p.sortDir === "asc"
            ? "Ascending, click for descending"
            : p.sortDir === "desc"
              ? "Descending, click to reset"
              : ""}
        </span>
      </button>
      <button
        type="button"
        disabled={!p.canGroup}
        className={item}
        onClick={run(p.onGroup)}
      >
        <span>Group</span>
        <span className="text-xs opacity-60">
          {p.grouped ? "On, click to turn off" : ""}
        </span>
      </button>
      {!p.isName && (
        <>
          <button type="button" className={item} onClick={() => setPage("left")}>
            <span>Insert left</span>
            <span aria-hidden="true">{"›"}</span>
          </button>
          <button type="button" className={item} onClick={() => setPage("right")}>
            <span>Insert right</span>
            <span aria-hidden="true">{"›"}</span>
          </button>
        </>
      )}
      <button type="button" className={item} onClick={run(p.onFit)}>
        Fit to content
      </button>
      {!p.isName && (
        <>
          <button type="button" className={item} onClick={run(p.onPin)}>
            {p.pinned ? "Unpin column" : "Pin column"}
          </button>
          <div className="my-1 border-t border-current/10" />
          <button type="button" className={item} onClick={run(p.onMoveStart)}>
            Move to start
          </button>
          <button type="button" className={item} onClick={run(p.onMoveEnd)}>
            Move to end
          </button>
          <div className="my-1 border-t border-current/10" />
          <button type="button" className={item} onClick={run(p.onHide)}>
            Hide column
          </button>
        </>
      )}
    </div>
  );
}

/* A column heading. Click it for the column menu, drag its right edge to
   resize. */
export default function ColumnHeader(props: Props) {
  const { label, colKey, left, sortDir, pinned } = props;
  const sticky = left !== undefined;
  return (
    <div
      role="columnheader"
      style={sticky ? { left } : undefined}
      className={`relative border-l border-current/10 ${
        sticky ? "md:sticky md:z-[2] bg-background" : ""
      }`}
    >
      <Popover
        label={`Column options for ${label}`}
        width={230}
        buttonClassName="flex w-full items-center gap-1 px-3 py-2 text-left hover:bg-current/5"
        trigger={
          <>
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {pinned && (
              <span aria-label="Pinned" title="Pinned" className="text-[10px] opacity-60">
                {"●"}
              </span>
            )}
            {sortDir && (
              <span aria-hidden="true" className="text-[11px] opacity-70">
                {sortDir === "asc" ? "↑" : "↓"}
              </span>
            )}
            <span aria-hidden="true" className="text-[10px] opacity-40">
              {"▾"}
            </span>
          </>
        }
      >
        {(close) => <MenuBody props={props} close={close} />}
      </Popover>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${label} column`}
        tabIndex={0}
        onPointerDown={(e) => props.onStart(colKey, e)}
        onPointerMove={props.onMove}
        onPointerUp={props.onEnd}
        onPointerCancel={props.onEnd}
        onKeyDown={(e) => props.onKey(colKey, e)}
        className="absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize touch-none hover:bg-accent/50 active:bg-accent"
      />
    </div>
  );
}
