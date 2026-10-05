/* Small line icons used in toolbars. They inherit the text color. */

type IconProps = { className?: string };

function Svg({
  className = "size-4 shrink-0",
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

export function ViewsIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 5h14M3 10h14M3 15h9" />
    </Svg>
  );
}

export function FilterIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 4.5h14l-5.5 6.5v4.5l-3 1.5V11z" />
    </Svg>
  );
}

export function SortIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6.5 16V4M3.5 7l3-3 3 3M13.5 4v12M10.5 13l3 3 3-3" />
    </Svg>
  );
}

export function GroupIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M10 3l7 3.5-7 3.5-7-3.5zM3 10.5l7 3.5 7-3.5M3 14l7 3.5 7-3.5" />
    </Svg>
  );
}

export function OptionsIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 6h7M14 6h3M3 14h3M10 14h7" />
      <circle cx="12" cy="6" r="2" />
      <circle cx="8" cy="14" r="2" />
    </Svg>
  );
}
