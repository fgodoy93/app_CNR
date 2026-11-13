'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { api } from '@/lib/api';

export default function AuditoriaPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [emails, setEmails] = useState<any[]>([]);

  useEffect(() => {
    api.get<{ data: any[] }>('/api/v1/admin/audit').then((r) => setLogs(r.data)).catch(() => undefined);
    api.get<{ data: any[] }>('/api/v1/admin/emails').then((r) => setEmails(r.data)).catch(() => undefined);
  }, []);

  return (
    <AppShell title="Auditoría de Modificaciones y Cola de Correos">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-3">Bitácora de Auditoría ({logs.length})</h3>
          <div className="space-y-2 max-h-[520px] overflow-y-auto text-xs">
            {logs.map((l) => (
              <div key={l.id} className="p-2.5 border rounded-lg">
                <div className="font-semibold text-slate-800">
                  [{l.entity}] {l.action} · {l.userName || 'Sistema'}
                </div>
                <div className="text-slate-500">{new Date(l.createdAt).toLocaleString('es-CL')} · ID: {l.entityId}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-3">Bandeja de Correos Salientes ({emails.length})</h3>
          <div className="space-y-2 max-h-[520px] overflow-y-auto text-xs">
            {emails.length === 0 ? (
              <p className="text-slate-400">Sin correos en cola.</p>
            ) : (
              emails.map((m) => (
                <div key={m.id} className="p-2.5 border rounded-lg">
                  <div className="flex justify-between font-semibold">
                    <span>{m.subject}</span>
                    <span className="px-1.5 py-0.5 bg-slate-100 rounded">{m.status}</span>
                  </div>
                  <div className="text-slate-500 mt-1">Para: {m.to.join(', ')}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
