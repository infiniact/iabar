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

// The IABar mark: the chat bubble IS the icon (no background badge). A browser
// window — royal blue title bar with red/yellow/green traffic-light dots — over a
// white body holding a royal blue AI spark, with a chat tail. Matches the
// extension icon (assets/icon.svg).
export const Logo = ({ size = 30 }: P) => (
  <svg width={size} height={size} viewBox="0 0 128 128" fill="none">
    <defs>
      <clipPath id="iabar-logo-bub">
        <path d="M30 8 H98 A22 22 0 0 1 120 30 V82 A22 22 0 0 1 98 104 H60 L40 123 L52 104 H30 A22 22 0 0 1 8 82 V30 A22 22 0 0 1 30 8 Z" />
      </clipPath>
      <linearGradient id="iabar-logo-cb" x1="64" y1="8" x2="64" y2="40" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#3E67EE" />
        <stop offset="1" stopColor="#2148C8" />
      </linearGradient>
    </defs>
    <g clipPath="url(#iabar-logo-bub)">
      <rect x="0" y="0" width="128" height="128" fill="#ffffff" />
      <rect x="0" y="0" width="128" height="40" fill="url(#iabar-logo-cb)" />
    </g>
    <path
      d="M30 8 H98 A22 22 0 0 1 120 30 V82 A22 22 0 0 1 98 104 H60 L40 123 L52 104 H30 A22 22 0 0 1 8 82 V30 A22 22 0 0 1 30 8 Z"
      fill="none"
      stroke="#2B5CE6"
      strokeWidth={4}
      strokeLinejoin="round"
    />
    <circle cx="28" cy="24" r="5.5" fill="#FF5F57" />
    <circle cx="46" cy="24" r="5.5" fill="#FEBC2E" />
    <circle cx="64" cy="24" r="5.5" fill="#28C840" />
    <path
      d="M64 48 C65.9 64.8 70.2 69.6 88 72 C70.2 74.4 65.9 79.2 64 96 C62.1 79.2 57.8 74.4 40 72 C57.8 69.6 62.1 64.8 64 48 Z"
      fill="#2B5CE6"
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
      d="M24 19.3 C24.5 23.6 25.6 24.9 30.2 25.5 C25.6 26.1 24.5 27.4 24 31.7 C23.5 27.4 22.4 26.1 17.8 25.5 C22.4 24.9 23.5 23.6 24 19.3 Z"
      fill="currentColor"
    />
  </svg>
)
