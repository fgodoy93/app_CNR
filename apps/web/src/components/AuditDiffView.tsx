'use client';

const ENTITY_LABELS: Record<string, string> = {
  activity: 'Orden / Actividad',
  evidence: 'Evidencia',
  geoFeature: 'Geometría GPS',
  user: 'Usuario',
  role: 'Rol',
  unit: 'Unidad',
  formTemplate: 'Formulario',
  workflow: 'Flujo de trabajo',
  webhook: 'Webhook',
  apiClient: 'Cliente API',
  connector: 'Conector',
};

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  create: { label: 'Creación / Ingreso', color: 'border-emerald-500' },
  update: { label: 'Edición', color: 'border-[#006fb3]' },
  delete: { label: 'Eliminación', color: 'border-[#e22c2c]' },
  delete_all: { label: 'Limpieza de geometrías', color: 'border-[#e22c2c]' },
  transition: { label: 'Cambio de estado', color: 'border-violet-500' },
  update_draft: { label: 'Edición de borrador', color: 'border-[#006fb3]' },
  publish: { label: 'Publicación', color: 'border-emerald-600' },
  revoke: { label: 'Revocación', color: 'border-[#e22c2c]' },
};

function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') {
    const s = JSON.stringify(v);
    return s.length > 90 ? `${s.slice(0, 90)}…` : s;
  }
  const s = String(v);
  return s.length > 90 ? `${s.slice(0, 90)}…` : s;
}

function summarizeChanges(action: string, changes: any): string[] {
  if (!changes || typeof changes !== 'object') return [];
  const before = changes.before && typeof changes.before === 'object' ? changes.before : null;
  const after = changes.after && typeof changes.after === 'object' ? changes.after : null;

  if ((action === 'delete' || action === 'delete_all') && before) {
    return Object.entries(before)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => `Eliminado ${k}: ${fmtVal(v)}`);
  }
  if (action === 'create' && after) {
    return Object.entries(after)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .slice(0, 5)
      .map(([k, v]) => `${k}: ${fmtVal(v)}`);
  }
  if (before && after) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const lines: string[] = [];
    for (const k of keys) {
      if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
        lines.push(`${k}: ${fmtVal(before[k])} → ${fmtVal(after[k])}`);
      }
    }
    return lines;
  }
  return [];
}

export function AuditDiffView({ log }: { log: any }) {
  const actMeta = ACTION_LABELS[log.action] ?? { label: log.action, color: 'border-slate-400' };
  const entLabel = ENTITY_LABELS[log.entity] ?? log.entity;
  const lines = summarizeChanges(log.action, log.changes);

  return (
    <div className={`text-xs border-l-2 ${actMeta.color} pl-3 py-1.5 space-y-0.5`}>
      <div className="font-semibold text-slate-800">
        [{entLabel}] {actMeta.label}
      </div>
      <div className="text-slate-500">
        {new Date(log.createdAt).toLocaleString('es-CL')} · Usuario: <b>{log.userName || 'Sistema'}</b>
      </div>
      {lines.length > 0 && (
        <div
          className={`mt-1 rounded px-2 py-1 text-[11px] space-y-0.5 ${
            log.action.startsWith('delete')
              ? 'bg-red-50 text-red-800 border border-red-200'
              : 'bg-slate-50 text-slate-700 border border-slate-200'
          }`}
        >
          {lines.map((line, idx) => (
            <div key={idx} className="break-all">
              • {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
