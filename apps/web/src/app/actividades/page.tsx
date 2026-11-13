'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { api } from '@/lib/api';
import { Plus, Search, MapPin, Paperclip } from 'lucide-react';

export default function ActividadesPage() {
  const [activities, setActivities] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
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

  return (
    <AppShell title="Gestión de Actividades y Órdenes de Trabajo">
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load()}
              placeholder="Buscar folio, título o dirección..."
              className="pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white w-64"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
          >
            <option value="">Todos los estados</option>
            <option value="PENDIENTE">Pendiente</option>
            <option value="ASIGNADA">Asignada</option>
            <option value="EN_EJECUCION">En ejecución</option>
            <option value="EN_REVISION">En revisión</option>
            <option value="EN_APROBACION">En aprobación</option>
            <option value="CERRADA">Cerrada</option>
          </select>
          <button onClick={load} className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium">
            Filtrar
          </button>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#0f4c81] hover:bg-blue-900 text-white text-sm font-medium rounded-lg shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Crear Orden / Inspección
        </button>
      </div>

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
              {activities.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Sin resultados</td></tr>
              ) : (
                activities.map((a) => (
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
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Ej. Canal Matriz Maule Km 14" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
              <button type="submit" disabled={saving} className="px-4 py-2 bg-[#0f4c81] text-white rounded-lg text-sm font-medium">
                {saving ? 'Creando...' : 'Crear Actividad'}
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
