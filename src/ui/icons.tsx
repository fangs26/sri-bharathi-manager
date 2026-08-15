import type { SVGProps } from 'react';

/** One consistent 24-grid stroke set, sized by the `size` prop. */
function Base({ size = 18, children, ...rest }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

type P = SVGProps<SVGSVGElement> & { size?: number };

export const IconHome = (p: P) => (
  <Base {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
    <path d="M9.5 21v-6h5v6" />
  </Base>
);

export const IconBed = (p: P) => (
  <Base {...p}>
    <path d="M3 18V6" />
    <path d="M3 12h18v6" />
    <path d="M21 18v-4a2 2 0 0 0-2-2" />
    <circle cx="7.5" cy="9" r="2" />
  </Base>
);

export const IconUsers = (p: P) => (
  <Base {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20c0-3.2 2.7-5.2 6-5.2s6 2 6 5.2" />
    <path d="M16 5.2a3.2 3.2 0 0 1 0 6" />
    <path d="M17.5 14.6c2.1.6 3.5 2.2 3.5 4.4" />
  </Base>
);

export const IconRupee = (p: P) => (
  <Base {...p}>
    <path d="M7 4h10" />
    <path d="M7 8.5h10" />
    <path d="M13.5 4c2.5 0 3.5 2 3.5 4s-1.5 4-4.5 4H7l7 8" />
  </Base>
);

export const IconChart = (p: P) => (
  <Base {...p}>
    <path d="M4 20h16" />
    <rect x="5" y="11" width="3.5" height="6" rx="1" />
    <rect x="10.5" y="7" width="3.5" height="10" rx="1" />
    <rect x="16" y="13" width="3.5" height="4" rx="1" />
  </Base>
);

export const IconSettings = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
  </Base>
);

export const IconPlus = (p: P) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);

export const IconSearch = (p: P) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Base>
);

export const IconPhone = (p: P) => (
  <Base {...p}>
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.1 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />
  </Base>
);

export const IconWhatsApp = ({ size = 18, ...rest }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...rest}>
    <path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2Zm0 1.8a8.2 8.2 0 1 1-4.2 15.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 0 1 12 3.8Zm-3.4 4c-.2 0-.5.1-.7.4-.2.3-.9.9-.9 2.1s.9 2.4 1 2.6c.1.2 1.7 2.7 4.2 3.7 2.1.8 2.5.7 3 .6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.6-.3l-2-1c-.3-.1-.5-.2-.7.1l-.7.9c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-2-1.2 7.5 7.5 0 0 1-1.4-1.7c-.1-.3 0-.4.1-.5l.4-.5.3-.5v-.5l-.9-2c-.2-.5-.4-.5-.6-.5h-.9Z" />
  </svg>
);

export const IconPrint = (p: P) => (
  <Base {...p}>
    <path d="M6 9V3h12v6" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="7" rx="1" />
  </Base>
);

export const IconClose = (p: P) => (
  <Base {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Base>
);

export const IconChevronRight = (p: P) => (
  <Base {...p}>
    <path d="m9 6 6 6-6 6" />
  </Base>
);

export const IconChevronDown = (p: P) => (
  <Base {...p}>
    <path d="m6 9 6 6 6-6" />
  </Base>
);

export const IconEdit = (p: P) => (
  <Base {...p}>
    <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" />
    <path d="m14.5 6.5 3 3" />
  </Base>
);

export const IconTrash = (p: P) => (
  <Base {...p}>
    <path d="M4 7h16" />
    <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    <path d="M6 7v13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7" />
    <path d="M10 11v6M14 11v6" />
  </Base>
);

export const IconCheck = (p: P) => (
  <Base {...p}>
    <path d="m4.5 12.5 5 5L20 7" />
  </Base>
);

export const IconAlert = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.2v.3" />
  </Base>
);

export const IconDownload = (p: P) => (
  <Base {...p}>
    <path d="M12 3v12" />
    <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
    <path d="M4 20h16" />
  </Base>
);

export const IconUpload = (p: P) => (
  <Base {...p}>
    <path d="M12 15V3" />
    <path d="m7.5 7.5 4.5-4.5 4.5 4.5" />
    <path d="M4 20h16" />
  </Base>
);

export const IconLock = (p: P) => (
  <Base {...p}>
    <rect x="4.5" y="10" width="15" height="11" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </Base>
);

export const IconDoor = (p: P) => (
  <Base {...p}>
    <path d="M4 21h16" />
    <path d="M6 21V4a1 1 0 0 1 1.2-1l9 -1.8A1 1 0 0 1 17.5 2.2V21" />
    <circle cx="14" cy="12" r="0.9" fill="currentColor" stroke="none" />
  </Base>
);

export const IconSwap = (p: P) => (
  <Base {...p}>
    <path d="M4 8h13l-3-3" />
    <path d="M20 16H7l3 3" />
  </Base>
);

export const IconCloud = (p: P) => (
  <Base {...p}>
    <path d="M17.5 19a4.5 4.5 0 0 0 .3-9 6 6 0 0 0-11.6 1.5A3.75 3.75 0 0 0 6.5 19Z" />
  </Base>
);

export const IconCalendar = (p: P) => (
  <Base {...p}>
    <rect x="3.5" y="5" width="17" height="16" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Base>
);

export const IconSheet = (p: P) => (
  <Base {...p}>
    <rect x="3.5" y="4" width="17" height="16" rx="2" />
    <path d="M3.5 9h17M3.5 14.5h17M9.5 9v11M15 9v11" />
  </Base>
);

export const IconFilter = (p: P) => (
  <Base {...p}>
    <path d="M4 6h16l-6.2 7.4V19l-3.6 2v-7.6Z" />
  </Base>
);
