"use client";

import CoverBanner, { CoverAddButton } from "./Cover";
import ImagePicker from "./ImagePicker";
import ProjectImage from "./ProjectImage";
import { usePersonal } from "./PersonalProvider";
import { isShown, type Cover } from "@/lib/cover";
import type { CoverPageKey, PageIcon } from "@/lib/personal";

export const coverLinkClass =
  "rounded px-1.5 py-0.5 text-xs opacity-60 hover:bg-current/10 hover:opacity-100";

/* The header art for a page: a cover across the top and an icon that sits
   on its bottom edge. With neither, it shows "Add icon" and "Add cover"
   when you point at the top of the page. Everything here is yours only. */
export default function PageCover({
  page,
  label,
  containerClassName,
}: {
  page: CoverPageKey;
  /** Page name, for screen readers. */
  label: string;
  /** The same width and side padding as the page content below. */
  containerClassName: string;
}) {
  const { me, personal, update } = usePersonal();
  const cover = personal.covers[page] ?? null;
  const icon = personal.icons[page] ?? null;
  const shown = isShown(cover);
  const folder = `covers/${me}`;

  function saveCover(next: Cover | null) {
    return update((p) => {
      const covers = { ...p.covers };
      if (next) covers[page] = next;
      else delete covers[page];
      return { ...p, covers };
    });
  }

  async function saveIcon(next: PageIcon) {
    await update((p) => {
      const icons = { ...p.icons };
      if (next.imageUrl || next.emoji) icons[page] = next;
      else delete icons[page];
      return { ...p, icons };
    });
  }

  const iconValue = icon ?? { imageUrl: null, emoji: null };
  const hasIcon = Boolean(icon);

  return (
    <div className="group/pagecover">
      {shown && <CoverBanner cover={cover} canEdit folder={folder} onSave={saveCover} />}
      <div className={`relative ${containerClassName}`}>
        {hasIcon && (
          <div className={`${shown ? "-mt-9" : "pt-6"} relative -mb-3 w-fit`}>
            <ImagePicker
              name={label}
              value={iconValue}
              folder={`page-icons/${me}`}
              size={64}
              resetLabel="Remove icon"
              buttonClassName="rounded-xl ring-4 ring-background hover:opacity-90"
              onChange={saveIcon}
            />
          </div>
        )}
        {(!hasIcon || !shown) && (
          <div
            className="absolute left-0 top-0 z-10 flex gap-1 px-[inherit] pt-1 opacity-0 transition-opacity group-hover/pagecover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-60"
          >
            {!hasIcon && (
              <ImagePicker
                name={label}
                value={iconValue}
                folder={`page-icons/${me}`}
                resetLabel="Remove icon"
                trigger={
                  <span className="flex items-center gap-1">
                    <ProjectImage name="" emoji="🙂" size={14} />
                    Add icon
                  </span>
                }
                buttonClassName={coverLinkClass}
                onChange={saveIcon}
              />
            )}
            {!shown && (
              <CoverAddButton cover={cover} folder={folder} onSave={saveCover} className={coverLinkClass} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
