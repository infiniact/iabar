// Minimal inline SVG icons (stroke = currentColor so they theme automatically).
type P = { size?: number }
const base = (size = 18) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
})

export const PlusIcon = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const HistoryIcon = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M3 3v5h5" />
    <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
    <path d="M12 7v5l4 2" />
  </svg>
)

export const SettingsIcon = ({ size }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

export const SendIcon = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M22 2 11 13" />
    <path d="M22 2 15 22l-4-9-9-4 20-7z" />
  </svg>
)

export const AtIcon = ({ size }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
  </svg>
)

export const CloseIcon = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
)

export const TrashIcon = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
  </svg>
)

export const MessageIcon = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
)

export const ScreenshotIcon = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M7 3H5a2 2 0 0 0-2 2v2" />
    <path d="M17 3h2a2 2 0 0 1 2 2v2" />
    <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
    <path d="M17 21h2a2 2 0 0 0 2-2v-2" />
    <rect x="8" y="8" width="8" height="8" rx="1" />
  </svg>
)

export const PaperclipIcon = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
)

export const ExpertIcon = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
)

export const SkillIcon = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3Z" />
    <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" />
  </svg>
)

export const AppsIcon = ({ size }: P) => (
  <svg {...base(size)}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
)

export const ShieldIcon = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
  </svg>
)

export const ReadIcon = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M6 2h8l4 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" />
    <path d="M14 2v4h4" />
    <path d="M8 13h8M8 17h6" />
  </svg>
)

export const TranslateIcon = ({ size }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z" />
  </svg>
)

export const PencilIcon = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
  </svg>
)

export const ChevronDownIcon = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="m6 9 6 6 6-6" />
  </svg>
)

export const CheckIcon = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
)

export const EyeIcon = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

export const EyeOffIcon = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M9.88 4.24A9.1 9.1 0 0 1 12 4c7 0 10 8 10 8a18.6 18.6 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <path d="M6.6 6.6A18.6 18.6 0 0 0 2 12s3 8 10 8a9.3 9.3 0 0 0 5.4-1.6" />
    <path d="m2 2 20 20" />
  </svg>
)

// The IABar mark: a black-titanium badge (brushed dark metal + a diagonal
// specular streak) with a polished-silver browser window / chat bubble
// (header dots = browser, tail = conversation, graphite spark = AI). Metallic,
// monochrome. Matches the extension icon.
export const Logo = ({ size = 30 }: P) => (
  <svg width={size} height={size} viewBox="0 0 128 128" fill="none">
    <defs>
      <clipPath id="iabar-logo-r">
        <rect x="2" y="2" width="124" height="124" rx="30" />
      </clipPath>
      <linearGradient id="iabar-logo-ti" x1="14" y1="6" x2="118" y2="124" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#2f87cf" />
        <stop offset="0.42" stopColor="#1a6fbb" />
        <stop offset="0.5" stopColor="#2782c9" />
        <stop offset="0.58" stopColor="#155fa0" />
        <stop offset="1" stopColor="#0e5290" />
      </linearGradient>
      <linearGradient id="iabar-logo-streak" x1="0" y1="0" x2="128" y2="96" gradientUnits="userSpaceOnUse">
        <stop offset="0.3" stopColor="#FFC56B" stopOpacity="0" />
        <stop offset="0.44" stopColor="#FFC56B" stopOpacity="0.45" />
        <stop offset="0.5" stopColor="#FF8A66" stopOpacity="0.55" />
        <stop offset="0.56" stopColor="#FF5FA2" stopOpacity="0.4" />
        <stop offset="0.64" stopColor="#FF5FA2" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="iabar-logo-ag" x1="64" y1="28" x2="64" y2="106" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#f6f8fa" />
        <stop offset="0.2" stopColor="#dadee3" />
        <stop offset="0.5" stopColor="#b4bac2" />
        <stop offset="0.54" stopColor="#cfd4da" />
        <stop offset="0.8" stopColor="#979ea7" />
        <stop offset="1" stopColor="#838a93" />
      </linearGradient>
      <linearGradient id="iabar-logo-spark" x1="64" y1="58" x2="64" y2="84" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#4c5158" />
        <stop offset="1" stopColor="#23262b" />
      </linearGradient>
      <filter id="iabar-logo-sh" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="3.5" />
        <feOffset dy="2.5" />
        <feComponentTransfer>
          <feFuncA type="linear" slope="0.45" />
        </feComponentTransfer>
        <feMerge>
          <feMergeNode />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <g clipPath="url(#iabar-logo-r)">
      <rect x="2" y="2" width="124" height="124" fill="url(#iabar-logo-ti)" />
      <rect x="2" y="2" width="124" height="124" fill="url(#iabar-logo-streak)" />
      <ellipse cx="40" cy="20" rx="78" ry="48" fill="#ffffff" fillOpacity="0.06" />
    </g>
    <rect x="3.5" y="3.5" width="121" height="121" rx="28.5" fill="none" stroke="#ffffff" strokeOpacity="0.1" strokeWidth="1" />
    <g filter="url(#iabar-logo-sh)">
      <path d="M46 82 L36 105 L64 84 Z" fill="url(#iabar-logo-ag)" />
      <path
        d="M42 30 H86 A18 18 0 0 1 104 48 V68 A18 18 0 0 1 86 86 H42 A18 18 0 0 1 24 68 V48 A18 18 0 0 1 42 30 Z"
        fill="url(#iabar-logo-ag)"
      />
    </g>
    <path
      d="M42 30 H86 A18 18 0 0 1 104 48 V68 A18 18 0 0 1 86 86 H42 A18 18 0 0 1 24 68 V48 A18 18 0 0 1 42 30 Z"
      fill="none"
      stroke="#ffffff"
      strokeOpacity="0.55"
      strokeWidth="1.2"
    />
    <circle cx="41" cy="44" r="3.6" fill="#565b62" />
    <circle cx="54" cy="44" r="3.6" fill="#565b62" />
    <circle cx="67" cy="44" r="3.6" fill="#565b62" />
    <line x1="26" y1="55" x2="102" y2="55" stroke="#000000" strokeOpacity="0.14" strokeWidth="1.6" />
    <path
      d="M64 59 C65.7 67.5 69.5 70.3 79 71.5 C69.5 72.7 65.7 75.5 64 84 C62.3 75.5 58.5 72.7 49 71.5 C58.5 70.3 62.3 67.5 64 59 Z"
      fill="url(#iabar-logo-spark)"
    />
  </svg>
)

// Empty-state hero mark — a LINE-style take on the same browser-chat-bubble +
// spark concept (currentColor, so it follows the theme accent). Deliberately
// distinct from the filled glass Logo: lighter, illustrative, matching the
// quick-action card icons rather than re-using the app badge.
export const HeroMark = ({ size = 52 }: P) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <g stroke="currentColor" strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round">
      <path
        d="M14 8 H34 A8 8 0 0 1 42 16 V26 A8 8 0 0 1 34 34 H20 L11 43 L18 34 H14 A8 8 0 0 1 6 26 V16 A8 8 0 0 1 14 8 Z"
        fill="currentColor"
        fillOpacity={0.06}
      />
      <path d="M6 17 H42" strokeOpacity={0.5} />
    </g>
    <circle cx="12" cy="12.5" r="1.5" fill="currentColor" />
    <circle cx="17" cy="12.5" r="1.5" fill="currentColor" />
    <circle cx="22" cy="12.5" r="1.5" fill="currentColor" />
    <path
      d="M24 19 C24.6 22.6 26.4 24.4 30 25 C26.4 25.6 24.6 27.4 24 31 C23.4 27.4 21.6 25.6 18 25 C21.6 24.4 23.4 22.6 24 19 Z"
      fill="currentColor"
    />
  </svg>
)
