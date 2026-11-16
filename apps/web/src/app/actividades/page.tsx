'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';
import { api } from '@/lib/api';
import { Plus, Search, MapPin, Paperclip, LayoutList, Columns3 } from 'lucide-react';

const KANBAN_COLS = [
  { key: 'PENDIENTE', label: 'Pendiente', accent: 'border-t-slate-400', badge: 'bg-slate-100 text-slate-700' },
  { key: 'ASIGNADA', label: 'Asignada', accent: 'border-t-sky-600', badge: 'bg-sky-50 text-sky-800' },
  { key: 'EN_EJECUCION', label: 'En Ejecución', accent: 'border-t-amber-500', badge: 'bg-amber-50 text-amber-800' },
  { key: 'EN_REVISION', label: 'En Revisión', accent: 'border-t-cyan-600', badge: 'bg-cyan-50 text-cyan-800' },
  { key: 'CERRADA', label: 'Cerrada', accent: 'border-t-[#146c43]', badge: 'bg-emerald-50 text-[#146c43]' },
];

export default function ActividadesPage() {
  const [activities, setActivities] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ typeId: '', title: '', description: '', priority: 'MEDIA', assigneeId: '', address: '', lat: '', lng: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    api.get<{ data: any[] }>(`/api/v1/activities?${params.toString()}`).then((r) => setActivities(r.data)).catch((e) => setError(e.message));
  };

  useEffect(() => {
    load();
    api.get<{ data: any[] }>('/api/v1/admin/activity-types').then((r) => {
      setTypes(r.data);
      if (r.data[0]) setForm((f) => ({ ...f, typeId: f.typeId || r.data[0].id }));
    });
    api.get<{ data: any[] }>('/api/v1/admin/users').then((r) => setUsers(r.data));
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post('/api/v1/activities', {
        typeId: form.typeId,
        title: form.title,
        description: form.description || null,
        priority: form.priority,
        assigneeId: form.assigneeId || null,
        address: form.address || null,
        lat: form.lat ? Number(form.lat) : null,
        lng: form.lng ? Number(form.lng) : null,
      });
      setShowModal(false);
      setForm((f) => ({ ...f, title: '', description: '', address: '', lat: '', lng: '' }));
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const filteredActivities = activities.filter((a) => {
    const matchText =
      !q.trim() ||
      a.folio?.toLowerCase().includes(q.toLowerCase()) ||
      a.title?.toLowerCase().includes(q.toLowerCase()) ||
      a.address?.toLowerCase().includes(q.toLowerCase());
    const matchStatus = !status || a.status === status || (status === 'EN_REVISION' && a.status === 'EN_APROBACION');
    return matchText && matchStatus;
  });

  return (
    <AppShell title="Gestión de Actividades y Órdenes de Trabajo">
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load()}
              placeholder="Buscar folio, título o dirección..."
              className="gob-input pl-9 w-72"
            />
          </div>
          <button onClick={load} className="btn btn-outline-secondary btn-default-size">
            Actualizar
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-[4px] border border-[#d9e2ec] bg-white p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={`btn btn-sm border-0 ${
                viewMode === 'list' ? 'btn-primary' : 'bg-transparent text-slate-600 hover:bg-slate-50'
              }`}
            >
              <LayoutList className="w-3.5 h-3.5" />
              Listado
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`btn btn-sm border-0 ${
                viewMode === 'kanban' ? 'btn-success' : 'bg-transparent text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Columns3 className="w-3.5 h-3.5" />
              Kanban
            </button>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="btn btn-primary btn-default-size"
          >
            <Plus className="w-4 h-4" />
            Crear Orden / Inspección
          </button>
        </div>
      </div>

      {/* Quick 1-click status filter pills */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {[
          { key: '', label: `Todas (${activities.length})` },
          ...KANBAN_COLS.map((c) => ({
            key: c.key,
            label: `${c.label} (${activities.filter((a) => a.status === c.key || (c.key === 'EN_REVISION' && a.status === 'EN_APROBACION')).length})`,
          })),
        ].map((pill) => (
          <button
            key={pill.key || 'ALL'}
            onClick={() => setStatus(pill.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
              status === pill.key
                ? 'bg-[#006fb3] text-white border-[#006fb3]'
                : 'bg-white text-slate-600 border-[#d9e2ec] hover:bg-slate-50'
            }`}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {viewMode === 'kanban' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4 items-start">
          {KANBAN_COLS.map((col) => {
            const colItems = filteredActivities.filter((a) => a.status === col.key || (col.key === 'EN_REVISION' && a.status === 'EN_APROBACION'));
            return (
              <div key={col.key} className={`bg-[#f7faf9] rounded-xl border border-[#d9e2ec] border-t-4 ${col.accent} p-3`}>
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${col.badge}`}>{col.label}</span>
                  <span className="text-xs font-bold text-slate-500">{colItems.length}</span>
                </div>
                <div className="space-y-2.5">
                  {colItems.length === 0 ? (
                    <div className="text-xs text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-lg">
                      Sin actividades
                    </div>
                  ) : (
                    colItems.map((a) => (
                      <Link
                        key={a.id}
                        href={`/actividades/${a.id}`}
                        className="block bg-white p-3 rounded-lg border border-[#d9e2ec] shadow-sm hover:border-[#006fb3] transition-colors"
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="font-mono text-xs font-bold text-[#0e7490]">{a.folio}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            a.priority === 'CRITICA' ? 'bg-red-100 text-red-700' :
                            a.priority === 'ALTA' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                          }`}>{a.priority}</span>
                        </div>
                        <div className="text-xs font-semibold text-slate-800 line-clamp-2">{a.title}</div>
                        <div className="text-[11px] text-slate-500 mt-1 truncate">{a.type?.name}</div>
                        <div className="mt-2 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-1.5 bg-[#146c43] rounded-full" style={{ width: `${Math.min(100, a.progress ?? 0)}%` }} />
                        </div>
                        <div className="flex items-center justify-between mt-1.5 text-[10px] text-slate-500">
                          <span className="truncate">{a.assignee?.name || 'Sin asignar'}</span>
                          <span className="font-semibold">{a.progress ?? 0}%</span>
                        </div>
                        <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-100 text-[10px] text-slate-500">
                          <span>📍 {a.geoFeatureCount ?? 0} · 📎 {a.evidenceCount ?? 0}</span>
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const doc = await api.post<{ id: string; verifyCode: string }>(`/api/v1/activities/${a.id}/documents`, { kind: 'REPORT' });
                              await api.download(`/api/v1/documents/${doc.id}/download`, `${a.folio}-informe.pdf`);
                            }}
                            className="text-[#006fb3] font-semibold hover:underline"
                          >
                            📄 PDF
                          </button>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3">Folio</th>
                <th className="px-4 py-3">Título</th>
                <th className="px-4 py-3">Proceso</th>
                <th className="px-4 py-3">Prioridad</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Responsable</th>
                <th className="px-4 py-3">Terreno</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredActivities.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Sin resultados</td></tr>
              ) : (
                filteredActivities.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-semibold text-blue-700">
                      <Link href={`/actividades/${a.id}`}>{a.folio}</Link>
                    </td>
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/actividades/${a.id}`} className="hover:underline">{a.title}</Link>
                    </td>
                    <td className="px-4 py-3">{a.type?.name}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        a.priority === 'CRITICA' ? 'bg-red-100 text-red-700' :
                        a.priority === 'ALTA' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                      }`}>{a.priority}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-800">{a.status}</span>
                    </td>
                    <td className="px-4 py-3">{a.assignee?.name || 'Sin asignar'}</td>
                    <td className="px-4 py-3 text-slate-500 flex items-center gap-3">
                      <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{a.geoFeatureCount}</span>
                      <span className="inline-flex items-center gap-1"><Paperclip className="w-3.5 h-3.5" />{a.evidenceCount}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <form onSubmit={create} className="bg-white rounded-xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-slate-800">Nueva Actividad / Orden de Trabajo</h3>
            <div>
              <label className="block text-sm font-medium mb-1">Tipo de Proceso</label>
              <select value={form.typeId} onChange={(e) => setForm({ ...form, typeId: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" required>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.prefix})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Título</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Descripción</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Prioridad</label>
                <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="BAJA">Baja</option>
                  <option value="MEDIA">Media</option>
                  <option value="ALTA">Alta</option>
                  <option value="CRITICA">Crítica</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Asignar a</label>
                <select value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="">Sin asignar</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role.key})</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Ubicación / Obra</label>
              <AddressAutocomplete
                value={form.address}
                onChange={(val) => setForm((f) => ({ ...f, address: val }))}
                onSelect={(item) =>
                  setForm((f) => ({
                    ...f,
                    address: item.address,
                    lat: String(item.lat),
                    lng: String(item.lng),
                  }))
                }
                placeholder="Ej. Canal Matriz Maule, Talca, Rancagua..."
              />
              {form.lat && form.lng && (
                <p className="text-[11px] text-emerald-700 mt-1">
                  📍 Coordenadas seleccionadas: {Number(form.lat).toFixed(5)}, {Number(form.lng).toFixed(5)}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
              <button type="submit" disabled={saving} className="px-4 py-2 bg-[#0f69c4] text-white rounded-lg text-sm font-medium">
                {saving ? 'Creando...' : 'Crear Actividad'}
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
