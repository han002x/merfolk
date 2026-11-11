// Tiny inline-SVG icon set. Icons inherit `currentColor` and a 1.6 stroke so
// they sit consistently next to text and flip with the theme automatically.

type IconName =
  | 'cursor'
  | 'rect'
  | 'round'
  | 'diamond'
  | 'circle'
  | 'tidy-down'
  | 'tidy-right'
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
  | 'page'
  | 'play'
  | 'pause'
  | 'stop'
  | 'step-back'
  | 'step-fwd'
  | 'image';

const PATHS: Record<IconName, React.ReactNode> = {
  page: (
    <>
      <path d="M7 3h7l4 4v14H7Z" />
      <path d="M14 3v4h4M10 12h5M10 16h5" />
    </>
  ),
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
  return (
    <svg
      className="mf-svg"
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
      {PATHS[name]}
    </svg>
  );
}
