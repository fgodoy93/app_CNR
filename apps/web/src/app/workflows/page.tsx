'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { api } from '@/lib/api';
import { DEFAULT_WORKFLOW } from '@terreno/shared';
import { Plus } from 'lucide-react';

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [statesText, setStatesText] = useState('BORRADOR:Borrador:open,EN_REVISION:En revisión:review,APROBADA:Aprobada:done');
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api.get<{ data: any[] }>('/api/v1/workflows').then((r) => setWorkflows(r.data)).catch(() => undefined);
  };

  useEffect(() => {
    load();
  }, []);

  const createWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const states = statesText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((item) => {
          const [key, label, category] = item.split(':');
          return {
            key: (key || 'ESTADO').toUpperCase(),
            label: label || key || 'Estado',
            category: (category as any) || 'open',
            final: category === 'done' || category === 'cancelled',
            color: category === 'done' ? '#16a34a' : category === 'review' ? '#8b5cf6' : '#0ea5e9',
          };
        });

      const transitions = states.slice(0, -1).map((s, idx) => ({
        key: `avanzar_${idx + 1}`,
        label: `Avanzar a ${states[idx + 1]!.label}`,
        from: [s.key],
        to: states[idx + 1]!.key,
        roles: idx > 0 ? ['supervisor', 'admin'] : [],
        approvalLevel: idx > 0 ? idx : undefined,
        actions: idx === states.length - 2 ? [{ type: 'pdf', kind: 'REPORT' }] : [],
      }));

      await api.post('/api/v1/workflows', {
        name,
        description,
        definition: {
          initial: states[0]?.key || DEFAULT_WORKFLOW.initial,
          states,
          transitions,
        },
      });
      setShowModal(false);
      setName('');
      setDescription('');
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <AppShell title="Flujos de Trabajo y Niveles de Aprobación">
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-slate-500">Configure flujos de autorización, notificaciones, generación de PDF y webhooks.</p>
        <button onClick={() => setShowModal(true)} className="btn btn-primary btn-default-size">
          <Plus className="w-4 h-4" /> Nuevo Flujo
        </button>
      </div>

      <div className="space-y-6">
        {workflows.map((wf) => {
          const def = wf.definition;
          return (
            <div key={wf.id} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">{wf.name}</h3>
                {wf.description && <p className="text-xs text-slate-500">{wf.description}</p>}
                <p className="text-sm text-slate-500 mt-1">Estado inicial: <span className="font-mono font-semibold">{def.initial}</span></p>
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

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <form onSubmit={createWorkflow} className="bg-white rounded-xl max-w-lg w-full p-6 space-y-4">
            <h3 className="font-bold text-lg">Crear Flujo de Trabajo</h3>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del flujo (ej. Flujo Soporte TI)" className="w-full px-3 py-2 border rounded-lg text-sm" required />
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción" className="w-full px-3 py-2 border rounded-lg text-sm" />
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Estados (CLAVE:Etiqueta:categoria separados por coma)</label>
              <textarea value={statesText} onChange={(e) => setStatesText(e.target.value)} rows={3} className="w-full px-3 py-2 border rounded-lg text-xs font-mono" required />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowModal(false)} className="btn btn-outline-secondary btn-default-size">Cancelar</button>
              <button type="submit" className="btn btn-primary btn-default-size">Crear Flujo</button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
