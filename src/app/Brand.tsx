/** The monogram from the website's emblem.svg, redrawn inline so the app has
 *  no image dependencies and stays crisp at every size. */
export function Emblem({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="sbh-emblem" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#C2643F" />
          <stop offset="100%" stopColor="#D9A441" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#sbh-emblem)" />
      <path
        d="M32 13.5c6.5 4.8 12.5 6.6 17 6.9v14.2c0 8.9-6.6 14.4-17 17.9-10.4-3.5-17-9-17-17.9V20.4c4.5-.3 10.5-2.1 17-6.9Z"
        fill="none"
        stroke="rgba(255,255,255,.55)"
        strokeWidth="1.6"
      />
      <text
        x="32"
        y="41"
        textAnchor="middle"
        fill="#fff"
        fontSize="21"
        fontWeight="700"
        fontFamily="Georgia, 'Times New Roman', serif"
        letterSpacing="0.5"
      >
        SB
      </text>
    </svg>
  );
}
