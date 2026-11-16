'use client';

import { useState } from 'react';
import { Eye, X } from 'lucide-react';

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

const FIELD_LABELS: Record<string, string> = {
  folio: 'Folio',
  title: 'Título',
  description: 'Descripción',
  status: 'Estado',
  priority: 'Prioridad',
  progress: 'Progreso (%)',
  address: 'Ubicación / Dirección',
  assigneeId: 'Responsable',
  kind: 'Tipo',
  fileName: 'Archivo',
  fieldKey: 'Campo asociado',
  transcript: 'Transcripción',
  note: 'Nota / Observación',
  code: 'Código',
  label: 'Etiqueta',
  observations: 'Observaciones',
  accuracy: 'Precisión GPS (m)',
  items: 'Elementos',
  count: 'Cantidad',
};

function humanKey(key: string): string {
  const clean = key.replace(/^data\./, '');
  if (FIELD_LABELS[clean]) return FIELD_LABELS[clean]!;
  return clean
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^\w/, (c) => c.toUpperCase());
}

function humanValue(val: unknown): string {
  if (val === null || val === undefined || val === '') return 'Sin valor';
  if (typeof val === 'boolean') return val ? 'Sí' : 'No';
  if (Array.isArray(val)) {
    if (val.length === 0) return 'Ninguno';
    if (val.every((x) => typeof x === 'string' && /^[0-9a-f-]{32,36}$/i.test(x))) {
      return `${val.length} archivo(s) adjunto(s)`;
    }
    return val.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ');
  }
  if (typeof val === 'object') {
    const entries = Object.entries(val as Record<string, unknown>);
    if (entries.length === 0) return 'Vacío';
    return entries.map(([k, v]) => `${humanKey(k)}: ${humanValue(v)}`).join(' · ');
  }
  return String(val);
}

function flattenRecord(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const nested = flattenRecord(v as Record<string, unknown>, fullKey);
      if (Object.keys(nested).length === 0) {
        // Keep empty object only if needed, otherwise skip noise
      } else {
        Object.assign(out, nested);
      }
    } else {
      out[fullKey] = v;
    }
  }
  return out;
}

interface DiffRow {
  field: string;
  before: string;
  after: string;
}

function buildRows(action: string, changes: any): DiffRow[] {
  if (!changes || typeof changes !== 'object') return [];
  const rawBefore = changes.before && typeof changes.before === 'object' ? flattenRecord(changes.before) : {};
  const rawAfter = changes.after && typeof changes.after === 'object' ? flattenRecord(changes.after) : {};

  if (action === 'delete' || action === 'delete_all') {
    return Object.entries(rawBefore)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => ({
        field: humanKey(k),
        before: humanValue(v),
        after: 'Eliminado',
      }));
  }

  if (action === 'create') {
    return Object.entries(rawAfter)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => ({
        field: humanKey(k),
        before: '—',
        after: humanValue(v),
      }));
  }

  const keys = new Set([...Object.keys(rawBefore), ...Object.keys(rawAfter)]);
  const rows: DiffRow[] = [];
  for (const k of keys) {
    if (JSON.stringify(rawBefore[k]) !== JSON.stringify(rawAfter[k])) {
      rows.push({
        field: humanKey(k),
        before: humanValue(rawBefore[k]),
        after: humanValue(rawAfter[k]),
      });
    }
  }
  return rows;
}

export function AuditDiffView({ log }: { log: any }) {
  const [open, setOpen] = useState(false);
  const actMeta = ACTION_LABELS[log.action] ?? { label: log.action, color: 'border-slate-400' };
  const entLabel = ENTITY_LABELS[log.entity] ?? log.entity;
  const rows = buildRows(log.action, log.changes);
  const isDelete = String(log.action).startsWith('delete');

  return (
    <>
      <div
        onClick={() => rows.length > 0 && setOpen(true)}
        className={`text-xs border-l-2 ${actMeta.color} pl-3 py-1.5 space-y-0.5 ${
          rows.length > 0 ? 'cursor-pointer hover:bg-slate-50 rounded-r transition-colors' : ''
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-slate-800">
            [{entLabel}] {actMeta.label}
          </span>
          {rows.length > 0 && (
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                isDelete ? 'text-[#e22c2c]' : 'text-[#006fb3]'
              }`}
            >
              <Eye className="w-3 h-3" />
              {isDelete ? `Ver eliminado (${rows.length})` : `Ver detalle (${rows.length})`}
            </span>
          )}
        </div>
        <div className="text-slate-500">
          {new Date(log.createdAt).toLocaleString('es-CL')} · Usuario: <b>{log.userName || 'Sistema'}</b>
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-[6px] border border-[#d9e2ec] max-w-2xl w-full shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="gob-stripe" />
            <div className="px-5 py-4 border-b border-[#d9e2ec] flex items-center justify-between gap-3">
              <div>
                <h4 className="font-bold text-base text-[#006fb3]">
                  [{entLabel}] {actMeta.label}
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  {new Date(log.createdAt).toLocaleString('es-CL')} · Realizado por: <b>{log.userName || 'Sistema'}</b>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded hover:bg-slate-100 text-slate-500"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 max-h-[65vh] overflow-y-auto">
              <table className="w-full text-xs text-left border border-[#d9e2ec]">
                <thead className="bg-[#f7f9fb] text-slate-600 uppercase text-[11px]">
                  <tr>
                    <th className="px-3 py-2 border-b border-[#d9e2ec] w-1/4">Campo</th>
                    <th className="px-3 py-2 border-b border-[#d9e2ec] w-[37.5%]">
                      {isDelete ? 'Dato que existía' : 'Valor anterior'}
                    </th>
                    <th className="px-3 py-2 border-b border-[#d9e2ec] w-[37.5%]">
                      {isDelete ? 'Estado' : 'Valor nuevo'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#d9e2ec]">
                  {rows.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-semibold text-slate-800 align-top">{r.field}</td>
                      <td className={`px-3 py-2 align-top break-words ${isDelete ? 'bg-red-50/70 text-red-800' : 'text-slate-600'}`}>
                        {r.before}
                      </td>
                      <td className={`px-3 py-2 align-top break-words ${isDelete ? 'text-[#e22c2c] font-semibold' : 'bg-emerald-50/50 text-slate-900 font-medium'}`}>
                        {r.after}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-5 py-3 bg-[#f7f9fb] border-t border-[#d9e2ec] flex justify-end">
              <button type="button" onClick={() => setOpen(false)} className="btn btn-outline-secondary btn-sm">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
