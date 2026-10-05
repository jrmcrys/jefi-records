/* eslint-disable @next/next/no-img-element */

function initialsOf(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => Array.from(w)[0]?.toUpperCase() ?? "")
    .join("");
  return letters || "?";
}

function hueOf(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) % 360;
  return h;
}

/* A small picture for a project, doc or sheet: an uploaded photo, an emoji,
   or the initials of its name on a color picked from the name. */
export default function ProjectImage({
  name,
  imageUrl,
  emoji,
  size = 24,
  className = "",
}: {
  name: string;
  imageUrl?: string | null;
  emoji?: string | null;
  size?: number;
  className?: string;
}) {
  const box = { width: size, height: size };
  const radius = Math.round(size * 0.22);

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        className={`shrink-0 object-cover ${className}`}
        style={{ ...box, borderRadius: radius }}
      />
    );
  }

  if (emoji) {
    return (
      <span
        aria-hidden="true"
        className={`inline-flex shrink-0 items-center justify-center bg-current/10 ${className}`}
        style={{ ...box, borderRadius: radius, fontSize: Math.round(size * 0.62), lineHeight: 1 }}
      >
        {emoji}
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center font-semibold text-white ${className}`}
      style={{
        ...box,
        borderRadius: radius,
        fontSize: Math.round(size * 0.42),
        backgroundColor: `hsl(${hueOf(name)} 45% 36%)`,
      }}
    >
      {initialsOf(name)}
    </span>
  );
}
