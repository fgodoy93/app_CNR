export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <img
      src="/cnr-badge.jpg"
      alt="Logo Comisión Nacional de Riego (CNR)"
      width={size}
      height={size}
      style={{ width: size, height: size, borderRadius: '9999px', objectFit: 'cover', backgroundColor: '#ffffff' }}
    />
  );
}

export function CnrLogoFull({ className = 'h-16 w-auto' }: { className?: string }) {
  return <img src="/cnr-logo.png" alt="CNR - Comisión Nacional de Riego" className={className} />;
}
