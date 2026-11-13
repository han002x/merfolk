import { activeAppearance, useAppearance } from '../theme';
import { documentIcon } from '../appearance';

// Tiny inline-SVG icon set. Icons inherit `currentColor` and a 1.6 stroke so
// they sit consistently next to text and flip with the theme automatically.

type IconName =
  | 'cursor'
  | 'text'
  | 'line'
  | 'arrow'
  | 'link'
  | 'rect'
  | 'round'
  | 'diamond'
  | 'circle'
  | 'tidy-down'
  | 'tidy-right'
  | 'layout'
  | 'sun'
  | 'moon'
  | 'code'
  | 'close'
  | 'plus'
  | 'export'
  | 'import'
  | 'film'
  | 'trash'
  | 'fold'
  | 'group'
  | 'unfold'
  | 'more'
  | 'shapes'
  | 'pumpkin'
  | 'ghost'
  | 'bat'
  | 'skull'
  | 'book'
  | 'notebook'
  | 'monitor'
  | 'page'
  | 'deck'
  | 'grid'
  | 'expand'
  | 'play'
  | 'pause'
  | 'stop'
  | 'step-back'
  | 'step-fwd'
  | 'image';

const PATHS: Record<IconName, React.ReactNode> = {
  pumpkin: <><path d="M12 7C5 2 1 8 3 15c1 5 6 7 9 5 3 2 8 0 9-5 2-7-2-13-9-8ZM12 7c-1-3 0-5 2-5" /><path d="m6 11 3 1-2 2Zm12 0-3 1 2 2Z" fill="currentColor" stroke="none" /><path d="m7 16 2 2 3-1 3 1 2-2" /></>,
  ghost: <><path d="M5 21V10a7 7 0 0 1 14 0v11l-3-2-4 2-4-2Z" /><circle cx="9" cy="10" r="1" fill="currentColor" /><circle cx="15" cy="10" r="1" fill="currentColor" /><path d="M10 15h4" /></>,
  bat: <path d="m12 9-2-3-1 4C6 7 3 6 2 5v9c3-1 4 0 5 3 2-1 3 0 5 3 2-3 3-4 5-3 1-3 2-4 5-3V5c-1 1-4 2-7 5l-1-4Z" />,
  skull: <><path d="M8 21v-4a8 8 0 1 1 8 0v4ZM11 18v3M13 18v3" /><circle cx="8.5" cy="10.5" r="1.5" /><circle cx="15.5" cy="10.5" r="1.5" /><path d="m12 13-1 2h2Z" fill="currentColor" stroke="none" /></>,
  book: <><path d="M12 5C8 2 4 3 2 4v15c3-1 6-1 10 2 4-3 7-3 10-2V4c-2-1-6-2-10 1Z" /><path d="M12 5v16" /></>,
  notebook: <><rect x="5" y="3" width="15" height="18" rx="2" /><path d="M9 3v18M3 7h4M3 12h4M3 17h4M12 8h5M12 12h5" /></>,
  monitor: <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M12 17v4M8 21h8" /></>,
  text: <path d="M4 6V4h16v2M12 4v16M8 20h8" />,
  line: <path d="M5 19 19 5" />,
  arrow: <path d="M5 19 19 5M8 5h11v11" />,
  link: <path d="m10 13 4-4M8 15l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M13 9l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" />,
  page: (
    <>
      <path d="M7 3h7l4 4v14H7Z" />
      <path d="M14 3v4h4M10 12h5M10 16h5" />
    </>
  ),
  deck: (
    <>
      <rect x="6" y="3" width="16" height="14" rx="1.5" />
      <path d="M18 17v4H2V7h4M10 7h8M10 11h5" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <rect x="13" y="4" width="7" height="7" rx="1" />
      <rect x="4" y="13" width="7" height="7" rx="1" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
    </>
  ),
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  rect: <rect x="3" y="6" width="18" height="12" rx="2" />,
  round: <rect x="3" y="6" width="18" height="12" rx="6" />,
  diamond: <path d="M12 3 21 12 12 21 3 12Z" />,
  circle: <circle cx="12" cy="12" r="8" />,
  'tidy-down': (
    <>
      <path d="M12 4v16" />
      <path d="m6 14 6 6 6-6" />
    </>
  ),
  'tidy-right': (
    <>
      <path d="M4 12h16" />
      <path d="m14 6 6 6-6 6" />
    </>
  ),
  // Lucide layout-dashboard
  layout: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m3 17 5-5 4 4 3-3 6 6" />
    </>
  ),
  moon: <path d="M20 13A8 8 0 1 1 11 4a6 6 0 0 0 9 9Z" />,
  code: <path d="m8 7-5 5 5 5M16 7l5 5-5 5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  export: (
    <>
      <path d="M12 3v12" />
      <path d="m8 11 4 4 4-4" />
      <path d="M5 19h14" />
    </>
  ),
  import: (
    <>
      <path d="M12 15V3" />
      <path d="m8 7 4-4 4 4" />
      <path d="M5 19h14" />
    </>
  ),
  // a film strip: the frame with sprocket holes down the sides
  film: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 4v16M17 4v16" />
      <path d="M3 9h4M3 15h4M17 9h4M17 15h4" />
    </>
  ),
  // two cards gathered inside a dashed frame
  group: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3 2.5" />
      <rect x="7" y="7" width="6" height="4" rx="1" />
      <rect x="11" y="13" width="6" height="4" rx="1" />
    </>
  ),
  // arrow pointer
  cursor: (
    <path d="M5 3l14 7.5-6.2 1.7L10 18.5z" />
  ),
  // a page with its corner folded in
  fold: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
    </>
  ),
  // a sheet opened flat, creases showing
  unfold: (
    <>
      <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" />
      <path d="M9 4v14M15 6v14" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M6 7l1 13h10l1-13" />
    </>
  ),
  // a square, a circle and a triangle: the shape + icon library
  shapes: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <circle cx="17" cy="7" r="3.5" />
      <path d="M7 13.5l3.8 6.5H3.2z" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="3.5" />
    </>
  ),
  play: <path d="M7 4.5v15l12-7.5z" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="1.5" />,
  pause: <path d="M8 5v14M16 5v14" />,
  'step-back': (
    <>
      <path d="M18 5l-9 7 9 7z" />
      <path d="M5 5v14" />
    </>
  ),
  'step-fwd': (
    <>
      <path d="M6 5l9 7-9 7z" />
      <path d="M19 5v14" />
    </>
  ),
  // vertical three-dot kebab menu
  more: (
    <>
      <circle cx="12" cy="5" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="12" cy="19" r="1.4" />
    </>
  ),
};

export function Icon({
  name,
  size = 16,
}: {
  name: IconName;
  size?: number;
}) {
  const appearance = activeAppearance(useAppearance());
  const kind = name === 'page' ? 'wiki' : name === 'deck' ? 'slides' : undefined;
  const selected = kind ? documentIcon(appearance, kind) : undefined;
  return (
    <svg
      className="mf-svg"
      data-document-icon={kind}
      data-icon={selected?.symbol ?? name}
      style={kind ? { color: `var(--mf-${kind}-icon)` } : undefined}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[selected?.symbol ?? name]}
    </svg>
  );
}
