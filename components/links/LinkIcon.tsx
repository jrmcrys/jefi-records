/* eslint-disable @next/next/no-img-element */

import { parseGoogleFile, type GoogleFileType } from "@/lib/google";

const TYPE_STYLE: Record<GoogleFileType, { bg: string; letter: string }> = {
  doc: { bg: "#2563eb", letter: "D" },
  sheet: { bg: "#16a34a", letter: "S" },
  slides: { bg: "#d97706", letter: "P" },
  form: { bg: "#7c3aed", letter: "F" },
  file: { bg: "#6b7280", letter: "F" },
};

/* The default picture for a Google file: a folded page in the file's color. */
export function FileGlyph({ type, size }: { type: GoogleFileType; size: number }) {
  const s = TYPE_STYLE[type];
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="shrink-0">
      <path d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill={s.bg} />
      <path d="M14 2v5h5" fill="#ffffff" fillOpacity="0.45" />
      {type === "doc" && <path d="M8 11h8M8 14h8M8 17h5" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />}
      {type === "sheet" && (
        <path d="M7.5 10.5h9v7h-9zM7.5 14h9M12 10.5v7" stroke="#fff" strokeWidth="1.2" fill="none" />
      )}
      {type === "slides" && <rect x="7.5" y="11" width="9" height="6" rx="1" stroke="#fff" strokeWidth="1.3" fill="none" />}
      {type === "form" && <path d="M8 11.5h1.5M11 11.5h5M8 15h1.5M11 15h5" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />}
      {type === "file" && <path d="M8.5 13h7M8.5 16h5" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />}
    </svg>
  );
}

export default function LinkIcon({
  url,
  imageUrl,
  emoji,
  size = 28,
}: {
  url: string;
  imageUrl?: string | null;
  emoji?: string | null;
  size?: number;
}) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        className="shrink-0 object-cover"
        style={{ width: size, height: size, borderRadius: Math.round(size * 0.22) }}
      />
    );
  }
  if (emoji) {
    return (
      <span
        aria-hidden="true"
        className="inline-flex shrink-0 items-center justify-center"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.78), lineHeight: 1 }}
      >
        {emoji}
      </span>
    );
  }
  const type = parseGoogleFile(url)?.type ?? "file";
  return <FileGlyph type={type} size={size} />;
}
