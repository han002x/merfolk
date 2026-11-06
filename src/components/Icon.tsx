// Tiny inline-SVG icon set. Icons inherit `currentColor` and a 1.6 stroke so
// they sit consistently next to text and flip with the theme automatically.

type IconName =
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
  | 'export'
  | 'import'
  | 'trash';

const PATHS: Record<IconName, React.ReactNode> = {
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
  moon: <path d="M20 13A8 8 0 1 1 11 4a6 6 0 0 0 9 9Z" />,
  code: <path d="m8 7-5 5 5 5M16 7l5 5-5 5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
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
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M6 7l1 13h10l1-13" />
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
