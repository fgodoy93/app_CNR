export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-label="Logo TerrenoCNR">
      <rect width="40" height="40" rx="10" fill="#0B3B60" />
      {/* Surcos de riego / agua */}
      <path d="M8 29C12 26 16 26 20 29C24 32 28 32 32 29" stroke="#38BDF8" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M8 33.5C12 31 16 31 20 33.5C24 36 28 36 32 33.5" stroke="#0E7490" strokeWidth="2" strokeLinecap="round" />
      {/* Gota de agua */}
      <path
        d="M20 7C20 7 13 15 13 19.5C13 23.366 16.134 26.5 20 26.5C23.866 26.5 27 23.366 27 19.5C27 15 20 7 20 7Z"
        fill="#0EA5E9"
      />
      {/* Brote ambiental MMA */}
      <path
        d="M20 24.5C20 19.5 23.2 16 27.5 15.5C27 19.8 24 23.5 20 24.5Z"
        fill="#22C55E"
      />
    </svg>
  );
}
