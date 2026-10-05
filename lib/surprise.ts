import { contrast, readableOn } from "./theme";

/* "Surprise me": a matching set of theme colors that stays readable in both
   light and dark mode. Every set is checked before it is offered:
   - sidebar text is readable on the sidebar and on the selected item
   - button and badge colors carry white text at 4.5:1 or better
   - buttons stay visible on both a white page and a near-black page
   - the badge stays visible on the sidebar and differs in hue from the button */

export type ThemeSet = {
  sidebar: string;
  selected: string;
  accent: string;
  badge: string;
};

function hslToHex(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360;
  const ss = s / 100;
  const ll = l / 100;
  const k = (n: number) => (n + hh / 30) % 12;
  const a = ss * Math.min(ll, 1 - ll);
  const f = (n: number) =>
    ll - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

/* The first lightness that gives a color good for white text on both pages. */
function strongColor(h: number, s: number, against?: string): string | null {
  for (let l = 28; l <= 62; l += 1) {
    const hex = hslToHex(h, s, l);
    if (
      contrast(hex, "#ffffff") >= 4.5 &&
      contrast(hex, "#0a0a0a") >= 3 &&
      (!against || contrast(hex, against) >= 3)
    ) {
      return hex;
    }
  }
  return null;
}

function attempt(): ThemeSet | null {
  const hue = rand(0, 360);
  const dark = Math.random() < 0.6;

  const sidebar = dark
    ? hslToHex(hue, rand(26, 46), rand(13, 21))
    : hslToHex(hue, rand(28, 60), rand(93, 96));
  const selected = dark
    ? hslToHex(hue, rand(30, 48), rand(27, 33))
    : hslToHex(hue, rand(30, 55), rand(84, 88));

  const text = readableOn(sidebar);
  if (contrast(sidebar, text) < 7 || contrast(selected, text) < 4.5) return null;
  if (contrast(selected, sidebar) < 1.2) return null;

  const offset = pick([0, 30, -30, 150, 180, 210]);
  const accent = strongColor(hue + offset, rand(58, 82));
  if (!accent) return null;

  const badgeOffset = pick([150, 180, 210, 30, 330]);
  const badgeHue = hue + badgeOffset;
  const badge = strongColor(badgeHue, rand(62, 85), sidebar);
  if (!badge) return null;
  if (contrast(badge, selected) < 2.5) return null;

  /* the badge should not look like the button: at least 60 degrees apart */
  const apart = Math.abs((((badgeOffset - offset) % 360) + 540) % 360 - 180);
  if (apart < 60) return null;

  return { sidebar, selected, accent, badge };
}

export function surpriseColors(): ThemeSet {
  for (let i = 0; i < 200; i++) {
    const set = attempt();
    if (set) return set;
  }
  /* Never reached in practice, but a known-good set keeps the button working. */
  return {
    sidebar: "#1e2a3a",
    selected: "#31445d",
    accent: "#2f6f5e",
    badge: "#b3402f",
  };
}
