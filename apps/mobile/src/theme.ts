export const COLORS = {
  primary: '#0b3b60',      // Azul institucional CNR / Gob
  primaryMid: '#0f4c81',   // Azul medio
  green: '#146c43',        // Verde bosque / MMA
  greenSoft: '#ecfdf5',    // Fondo verde suave
  water: '#0e7490',        // Turquesa hídrico
  waterSoft: '#ecfeff',    // Fondo agua suave
  bg: '#f2f6f4',           // Fondo mineral claro
  surface: '#ffffff',
  border: '#d8e3df',
  text: '#0f241d',
  muted: '#4b635b',
  amber: '#d97706',
  amberSoft: '#fef3c7',
  danger: '#dc2626',
  dangerSoft: '#fee2e2',
  gobBlue: '#0039a6',
  gobRed: '#d52b1e',
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
