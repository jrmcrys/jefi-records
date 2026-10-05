"use client";

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { parseGoogleFile, thumbnailUrl, type LinkKind } from "@/lib/google";
import { relativeTime, shortDate, todayIso, type LinkPref, type LinkRow } from "@/lib/links";
import type { Profile, Tag } from "@/lib/types";
import { ChipBadge } from "../ChipPicker";
import Menu, { MenuItem } from "../Menu";
import Avatar from "../Avatar";
import LinkIcon, { FileGlyph } from "./LinkIcon";

export type ItemActions = {
  open: (viaGoogle: boolean) => void;
  copy: () => void;
  togglePin: () => void;
  edit: () => void;
  duplicate: () => void;
  move: () => void;
  toggleArchive: () => void;
  remove: () => void;
  toggleSelect: (shift: boolean) => void;
};

function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" role="img" aria-label="Private, only you" className="shrink-0 opacity-60">
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" role="img" aria-label="Pinned" className="shrink-0 opacity-60">
      <path d="M9.8 1.5 14.5 6.2l-1.4.4-2.6 2.6.3 3.3-1.2 1.2-2.7-2.7L3 14.9l-.9-.9L6 10.1 3.3 7.4l1.2-1.2 3.3.3 2.6-2.6z" />
    </svg>
  );
}

export function ItemMenu({
  link,
  mine,
  pinned,
  otherPage,
  actions,
}: {
  link: LinkRow;
  mine: boolean;
  pinned: boolean;
  otherPage: string;
  actions: ItemActions;
}) {
  return (
    <Menu label={`Actions for ${link.title}`}>
      <MenuItem onClick={() => actions.open(false)}>Open in Jefi Records</MenuItem>
      <MenuItem onClick={() => actions.open(true)}>Open in Google</MenuItem>
      <MenuItem onClick={actions.copy}>Copy link</MenuItem>
      <MenuItem onClick={actions.togglePin}>{pinned ? "Unpin" : "Pin to the top"}</MenuItem>
      <MenuItem onClick={actions.edit}>{mine ? "Edit details" : "Edit tags"}</MenuItem>
      <MenuItem onClick={actions.duplicate}>Duplicate entry</MenuItem>
      {mine && <MenuItem onClick={actions.move}>Move to {otherPage}</MenuItem>}
      {mine && <MenuItem onClick={actions.toggleArchive}>{link.archived ? "Restore" : "Archive"}</MenuItem>}
      {mine && (
        <MenuItem onClick={actions.remove} danger>
          Delete
        </MenuItem>
      )}
    </Menu>
  );
}

function Meta({
  link,
  pref,
  owner,
  mine,
  projectName,
}: {
  link: LinkRow;
  pref?: LinkPref;
  owner?: Profile;
  mine: boolean;
  projectName?: string;
}) {
  const today = todayIso();
  const reviewDue = link.review_on && link.review_on <= today;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs opacity-70">
      {link.visibility === "private" && <LockIcon />}
      {pref?.pinned && <PinIcon />}
      <span className="inline-flex items-center gap-1">
        {owner && <Avatar profile={owner} size={14} />}
        {mine ? "You" : owner?.name ?? "Someone"}, {shortDate(link.created_at)}
      </span>
      {pref?.last_opened_at && <span>Opened {relativeTime(pref.last_opened_at)}</span>}
      {link.review_on && (
        <span className={reviewDue ? "rounded bg-amber-500/20 px-1.5 font-medium text-amber-700 dark:text-amber-300" : ""}>
          {reviewDue ? "Review due" : `Review ${shortDate(link.review_on)}`}
        </span>
      )}
      {link.project_id && (
        <Link
          href={`/p/${link.project_id}${link.task_id ? `?task=${link.task_id}` : ""}`}
          className="underline decoration-current/30 hover:decoration-current"
          onClick={(e) => e.stopPropagation()}
        >
          {projectName ? `In ${projectName}` : "In a project"}
          {link.task_id ? " (task)" : ""}
        </Link>
      )}
    </p>
  );
}

type ItemProps = {
  link: LinkRow;
  pref?: LinkPref;
  owner?: Profile;
  mine: boolean;
  tags: Tag[];
  projectName?: string;
  selected: boolean;
  selecting: boolean;
  draggable: boolean;
  otherPage: string;
  actions: ItemActions;
};

/* One row in the list view. */
export function LinkRowItem(props: ItemProps) {
  const { link, pref, mine, tags, selected, selecting, draggable, actions } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: link.id,
    disabled: !draggable,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className={`group relative flex items-center gap-2 border-b border-current/10 py-2 pl-1 pr-1 ${selected ? "bg-accent/10" : ""}`}
    >
      {link.color && (
        <span aria-hidden="true" className="absolute inset-y-1.5 left-0 w-1 rounded-full" style={{ background: link.color }} />
      )}
      <div className="flex w-6 shrink-0 justify-center">
        {draggable && !selecting ? (
          <button
            type="button"
            aria-label={`Drag to reorder ${link.title}`}
            {...attributes}
            {...listeners}
            className="flex size-6 cursor-grab touch-none items-center justify-center rounded text-xs opacity-0 hover:bg-current/10 group-hover:opacity-50 active:cursor-grabbing [@media(hover:none)]:opacity-40"
          >
            {"⋮⋮"}
          </button>
        ) : null}
      </div>
      <input
        type="checkbox"
        checked={selected}
        aria-label={`Select ${link.title}`}
        onChange={() => {}}
        onClick={(e) => actions.toggleSelect(e.shiftKey)}
        className={`size-4 shrink-0 accent-[var(--accent)] ${selecting || selected ? "" : "opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:hidden"}`}
      />
      <button
        type="button"
        onClick={() => actions.open(false)}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-1.5 py-1 text-left hover:bg-current/5"
      >
        <LinkIcon url={link.url} imageUrl={link.image_url} emoji={link.emoji} size={28} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{link.title}</span>
          {link.note && <span className="block truncate text-xs opacity-70">{link.note}</span>}
          <Meta {...props} />
        </span>
      </button>
      {tags.length > 0 && (
        <span className="hidden max-w-[40%] shrink-0 flex-wrap justify-end gap-1 sm:flex">
          {tags.map((t) => (
            <ChipBadge key={t.id} chip={t} />
          ))}
        </span>
      )}
      <ItemMenu link={link} mine={mine} pinned={Boolean(pref?.pinned)} otherPage={props.otherPage} actions={actions} />
    </li>
  );
}

/* One card in the gallery view, with a preview from Google when the browser
   can load one. */
export function LinkCard(props: ItemProps) {
  const { link, pref, mine, tags, selected, selecting, actions } = props;
  const [thumbFailed, setThumbFailed] = useState(false);
  const file = parseGoogleFile(link.url);

  return (
    <li className={`group relative flex flex-col rounded-lg border ${selected ? "border-accent ring-2 ring-accent/40" : "border-current/15"}`}>
      {link.color && <span aria-hidden="true" className="absolute inset-x-0 top-0 z-10 h-1 rounded-t-lg" style={{ background: link.color }} />}
      <button type="button" onClick={() => actions.open(false)} className="relative block aspect-[16/10] w-full overflow-hidden rounded-t-lg bg-current/5 text-left">
        <span className="absolute inset-0 flex items-center justify-center">
          {link.image_url || link.emoji ? (
            <LinkIcon url={link.url} imageUrl={link.image_url} emoji={link.emoji} size={56} />
          ) : (
            <FileGlyph type={file?.type ?? "file"} size={56} />
          )}
        </span>
        {file && !thumbFailed && (
          <img
            src={thumbnailUrl(file)}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setThumbFailed(true)}
            onLoad={(e) => {
              // Google returns a tiny placeholder when there is no preview.
              if ((e.target as HTMLImageElement).naturalWidth < 40) setThumbFailed(true);
            }}
            className="absolute inset-0 size-full object-cover object-top"
          />
        )}
      </button>
      <input
        type="checkbox"
        checked={selected}
        aria-label={`Select ${link.title}`}
        onChange={() => {}}
        onClick={(e) => actions.toggleSelect(e.shiftKey)}
        className={`absolute left-2 top-2 z-10 size-4 accent-[var(--accent)] ${selecting || selected ? "" : "opacity-0 group-hover:opacity-100 focus:opacity-100"}`}
      />
      <div className="flex items-start gap-2 p-2.5">
        <LinkIcon url={link.url} imageUrl={link.image_url} emoji={link.emoji} size={20} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{link.title}</p>
          {link.note && <p className="truncate text-xs opacity-70">{link.note}</p>}
          <Meta {...props} />
          {tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {tags.map((t) => (
                <ChipBadge key={t.id} chip={t} />
              ))}
            </div>
          )}
        </div>
        <ItemMenu link={link} mine={mine} pinned={Boolean(pref?.pinned)} otherPage={props.otherPage} actions={actions} />
      </div>
    </li>
  );
}

export function otherPageLabel(kind: LinkKind): string {
  return kind === "doc" ? "Sheets" : "Docs";
}
