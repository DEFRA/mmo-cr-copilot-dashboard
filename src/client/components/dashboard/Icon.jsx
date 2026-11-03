const PATHS = {
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16.5 14.2c2.8.2 5 2.1 5 5.3" />
    </>
  ),
  sparkle: (
    <>
      <path d="M11 3l2 5.5L18.5 10.5 13 12.5 11 18l-2-5.5L3.5 10.5 9 8.5z" />
      <path d="M19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9z" />
    </>
  ),
  code: <path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 4l-3 16" />,
  rocket: (
    <>
      <path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2" />
      <path d="M9 15l-3-3c1.5-4.5 5-8.5 12-9-.5 7-4.5 10.5-9 12z" />
      <circle cx="14.5" cy="9.5" r="1.5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  rework: (
    <>
      <path d="M20 11a8 8 0 0 0-14.6-4.5L3 9" />
      <path d="M3 4v5h5" />
      <path d="M4 13a8 8 0 0 0 14.6 4.5L21 15" />
      <path d="M21 20v-5h-5" />
    </>
  ),
  box: (
    <>
      <path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5z" />
      <path d="M3 7.5l9 4.5 9-4.5M12 12v9" />
    </>
  ),
  plusminus: <path d="M4 7h7M7.5 3.5v7M13 17h7M19 4L5 20" />,
  bars: <path d="M4 20V11M10 20V4M16 20v-7M22 20H2" />,
  trend: (
    <>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  donut: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z" />
      <path d="M8.5 12l2.5 2.5 4.5-5" />
    </>
  ),
  bug: (
    <>
      <rect x="7" y="8" width="10" height="12" rx="5" />
      <path d="M12 11v9M9 5l1.5 3M15 5l-1.5 3M3 13h4M17 13h4M4 8l3 2M20 8l-3 2M4 19l3-2M20 19l-3-2" />
    </>
  ),
  ticket: (
    <>
      <path d="M3 6h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4z" />
      <path d="M14 7v2M14 11v2M14 15v2" />
    </>
  ),
  flow: <path d="M3 7h11M10 3l4 4-4 4M21 17H10M14 13l-4 4 4 4" />,
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  radar: (
    <>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="M12 8l4 2.5v4L12 16l-4-1.5v-4z" />
    </>
  ),
  funnel: <path d="M3 4h18l-7 8v6l-4 2v-8z" />,
  merge: (
    <>
      <circle cx="6" cy="5" r="2.5" />
      <circle cx="6" cy="19" r="2.5" />
      <circle cx="18" cy="12" r="2.5" />
      <path d="M6 7.5v9M6 7.5c0 4.5 4 4.5 9.5 4.5" />
    </>
  ),
  commit: (
    <>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M2 12h6.5M15.5 12H22" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </>
  ),
  repo: (
    <>
      <path d="M5 4h11l3 3v13H5z" />
      <path d="M9 4v6l2-1.5L13 10V4" />
    </>
  ),
  treemap: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="1" />
      <path d="M12 3v18M12 11h9M3 14h9" />
    </>
  ),
  scatter: (
    <>
      <path d="M3 3v18h18" />
      <circle cx="8" cy="15" r="1.5" />
      <circle cx="11" cy="9" r="1.5" />
      <circle cx="16" cy="13" r="1.5" />
      <circle cx="18" cy="6" r="1.5" />
    </>
  ),
  gauge: (
    <>
      <path d="M3.5 17a9 9 0 1 1 17 0" />
      <path d="M12 14l4-5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3l10 18H2z" />
      <path d="M12 10v5M12 18v.5" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3l9 5-9 5-9-5z" />
      <path d="M3 13l9 5 9-5" />
    </>
  ),
  branch: (
    <>
      <circle cx="6" cy="5" r="2.5" />
      <circle cx="18" cy="7" r="2.5" />
      <circle cx="6" cy="19" r="2.5" />
      <path d="M6 7.5v9M18 9.5c0 5-12 2-12 7" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12l3 3 5-6" />
    </>
  ),
  build: <path d="M14.5 6.5l3-3 3 3-3 3M3 21l9-9M12 7l5 5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  chevron: <path d="M6 9l6 6 6-6" />,
  pause: (
    <>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </>
  ),
  play: <path d="M7 4.5v15l12-7.5z" />
}

export const ICON_NAMES = Object.keys(PATHS)

/** Decorative inline SVG icon; an icon never replaces a text label. */
export function Icon({ name, size = 22, className }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </svg>
  )
}
