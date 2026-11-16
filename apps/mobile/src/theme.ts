export const COLORS = {
  primary: '#006fb3',      // Azul oficial Kit de Gobierno Digital Chile
  primaryMid: '#0f69c4',   // Azul Gobierno secundario
  green: '#146c43',        // Verde institucional / éxito
  greenSoft: '#ecfdf5',    // Fondo verde suave
  water: '#006fb3',        // Acento hídrico / Gobierno Digital
  waterSoft: '#e6f4fa',    // Fondo azul suave
  bg: '#f7f9fb',           // Fondo neutro Kit de Gobierno
  surface: '#ffffff',
  border: '#d9e2ec',
  text: '#222222',         // Texto accesible WCAG
  muted: '#4a5568',
  amber: '#d97706',
  amberSoft: '#fef3c7',
  danger: '#e22c2c',       // Rojo oficial Gobierno de Chile
  dangerSoft: '#fee2e2',
  gobBlue: '#006fb3',
  gobRed: '#e22c2c',
};

export const STATUS_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  PENDIENTE: { bg: '#f1f5f9', fg: '#334155', border: '#94a3b8' },
  ASIGNADA: { bg: '#e0f2fe', fg: '#0369a1', border: '#0284c7' },
  EN_EJECUCION: { bg: '#fef3c7', fg: '#b45309', border: '#d97706' },
  EN_REVISION: { bg: '#ecfeff', fg: '#0e7490', border: '#0891b2' },
  CERRADA: { bg: '#dcfce7', fg: '#15803d', border: '#146c43' },
};

export function getStatusStyle(status: string) {
  return STATUS_COLORS[status] ?? { bg: '#e0f2fe', fg: '#0b3b60', border: '#0b3b60' };
}
