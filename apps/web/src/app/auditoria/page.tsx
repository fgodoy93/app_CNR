'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { AuditDiffView } from '@/components/AuditDiffView';
import { api } from '@/lib/api';

const ENTITIES = [
  { key: '', label: 'Todas' },
  { key: 'activity', label: 'OTs / Actividades' },
  { key: 'evidence', label: 'Evidencias' },
  { key: 'geoFeature', label: 'Geometrías GPS' },
  { key: 'user', label: 'Usuarios' },
  { key: 'formTemplate', label: 'Formularios' },
];

export default function AuditoriaPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [emails, setEmails] = useState<any[]>([]);
  const [entityFilter, setEntityFilter] = useState('');

  useEffect(() => {
    api.get<{ data: any[] }>('/api/v1/admin/audit').then((r) => setLogs(r.data)).catch(() => undefined);
    api.get<{ data: any[] }>('/api/v1/admin/emails').then((r) => setEmails(r.data)).catch(() => undefined);
  }, []);

  const filteredLogs = entityFilter ? logs.filter((l) => l.entity === entityFilter) : logs;

  return (
    <AppShell title="Auditoría de Modificaciones y Cola de Correos">
      <div className="flex flex-wrap gap-2 mb-6">
        {ENTITIES.map((ent) => (
          <button
            key={ent.key || 'ALL'}
            onClick={() => setEntityFilter(ent.key)}
            className={`btn btn-sm ${entityFilter === ent.key ? 'btn-primary' : 'btn-outline-secondary'}`}
          >
            {ent.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="gob-card">
          <h3 className="font-semibold text-[#006fb3] mb-3">Bitácora de Trazabilidad ({filteredLogs.length})</h3>
          <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
            {filteredLogs.length === 0 ? (
              <p className="text-sm text-slate-400">Sin registros para este filtro.</p>
            ) : (
              filteredLogs.map((l) => (
                <div key={l.id} className="p-2.5 border border-[#d9e2ec] rounded bg-white">
                  <AuditDiffView log={l} />
                  <div className="text-[10px] text-slate-400 mt-1 pl-3">ID: {l.entityId}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="gob-card">
          <h3 className="font-semibold text-[#006fb3] mb-3">Bandeja de Correos Salientes ({emails.length})</h3>
          <div className="space-y-2 max-h-[540px] overflow-y-auto text-xs pr-1">
            {emails.length === 0 ? (
              <p className="text-slate-400">Sin correos en cola.</p>
            ) : (
              emails.map((m) => (
                <div key={m.id} className="p-2.5 border border-[#d9e2ec] rounded">
                  <div className="flex justify-between font-semibold">
                    <span>{m.subject}</span>
                    <span className="px-1.5 py-0.5 bg-slate-100 rounded">{m.status}</span>
                  </div>
                  <div className="text-slate-500 mt-1">
                    Para: {m.to.join(', ')} · {new Date(m.createdAt).toLocaleString('es-CL')}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
