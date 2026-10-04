/* eslint-disable @next/next/no-img-element */

type AvatarProfile = { name: string; avatar_url?: string | null };

export default function Avatar({
  profile,
  size = 24,
}: {
  profile?: AvatarProfile | null;
  size?: number;
}) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };

  if (!profile) {
    return (
      <span
        aria-hidden="true"
        className="inline-block shrink-0 rounded-full border border-dashed border-current/30"
        style={style}
      />
    );
  }

  if (profile.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt=""
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  const initials = profile.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-current/15 font-medium"
      style={style}
    >
      {initials || "?"}
    </span>
  );
}
