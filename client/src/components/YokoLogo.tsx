export function YokoMark({ size = 32 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 128 128" aria-hidden="true">
    <defs>
      <linearGradient id="yk-accent" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#5EC8FF" />
        <stop offset="1" stopColor="#6C6BF5" />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="124" height="124" rx="30" fill="#0B0D12" />
    <rect x="2" y="2" width="124" height="124" rx="30" fill="none" stroke="url(#yk-accent)" strokeOpacity=".35" strokeWidth="1.5" />
    <path d="M47 39 L47 89 L88 64 Z" fill="url(#yk-accent)" />
    <circle cx="94" cy="37" r="4.5" fill="url(#yk-accent)" fillOpacity=".9" />
  </svg>;
}

export default function YokoLogo({ height = 28, mark = true }: { height?: number; mark?: boolean }) {
  const scale = height / 32;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 8 * scale, height }} aria-label="YokoTV">
    {mark && <YokoMark size={height} />}
    <svg height={height} viewBox="0 0 168 32" role="img" aria-hidden="true">
      <text x="0" y="24" fontFamily="'Space Grotesk',sans-serif" fontWeight="700" fontSize="26" letterSpacing="-0.02em" fill="#f5f7fb">Yoko<tspan fill="#7fb8ff">TV</tspan></text>
    </svg>
  </span>;
}
