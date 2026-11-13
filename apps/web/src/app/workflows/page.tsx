'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { api } from '@/lib/api';

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<any[]>([]);

  useEffect(() => {
    api.get<{ data: any[] }>('/api/v1/workflows').then((r) => setWorkflows(r.data)).catch(() => undefined);
  }, []);

  return (
    <AppShell title="Flujos de Trabajo y Niveles de Aprobación">
      <div className="space-y-6">
        {workflows.map((wf) => {
          const def = wf.definition;
          return (
            <div key={wf.id} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">{wf.name}</h3>
                <p className="text-sm text-slate-500">Estado inicial: <span className="font-mono font-semibold">{def.initial}</span></p>
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase text-slate-500 mb-2">Estados configurados</h4>
                <div className="flex flex-wrap gap-2">
                  {(def.states ?? []).map((s: any) => (
                    <span
                      key={s.key}
                      className="px-3 py-1 rounded-full text-xs font-semibold text-white"
                      style={{ backgroundColor: s.color || '#64748b' }}
                    >
                      {s.label} ({s.key}) {s.final ? '· Final' : ''}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase text-slate-500 mb-2">Transiciones y Reglas de Autorización</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-500 uppercase">
                      <tr>
                        <th className="px-3 py-2">Acción</th>
                        <th className="px-3 py-2">Desde</th>
                        <th className="px-3 py-2">Hacia</th>
                        <th className="px-3 py-2">Roles permitidos</th>
                        <th className="px-3 py-2">Nivel Aprobación</th>
                        <th className="px-3 py-2">Acciones automáticas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(def.transitions ?? []).map((t: any) => (
                        <tr key={t.key}>
                          <td className="px-3 py-2 font-semibold">{t.label}</td>
                          <td className="px-3 py-2 font-mono">{t.from.join(', ')}</td>
                          <td className="px-3 py-2 font-mono">{t.to}</td>
                          <td className="px-3 py-2">{t.roles?.length ? t.roles.join(', ') : 'Responsable asignado'}</td>
                          <td className="px-3 py-2">{t.approvalLevel ? `Nivel ${t.approvalLevel}` : '—'}</td>
                          <td className="px-3 py-2">
                            {(t.actions ?? []).map((a: any, i: number) => (
                              <span key={i} className="inline-block mr-1 px-1.5 py-0.5 bg-blue-50 text-blue-800 rounded">
                                {a.type}{a.kind ? `:${a.kind}` : ''}
                              </span>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
