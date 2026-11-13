'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { api } from '@/lib/api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Download, Plus, ClipboardCheck, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';

interface DashboardData {
  total: number;
  byStatus: { status: string; count: number }[];
  byPriority: { priority: string; count: number }[];
  byType: { typeId: string; typeName: string; color: string; count: number }[];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<DashboardData>('/api/v1/reports/dashboard'),
      api.get<{ data: any[] }>('/api/v1/activities'),
    ])
      .then(([dash, acts]) => {
        setData(dash);
        setRecent(acts.data.slice(0, 8));
      })
      .catch((e) => setError(e.message));
  }, []);

  const countStatus = (s: string) => data?.byStatus.find((x) => x.status === s)?.count ?? 0;
  const countPriority = (p: string) => data?.byPriority.find((x) => x.priority === p)?.count ?? 0;

  return (
    <AppShell title="Panel de Control y Reportabilidad">
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Resumen Operacional en Terreno</h2>
          <p className="text-sm text-slate-500">Seguimiento en tiempo real de inspecciones, órdenes de trabajo y visitas técnicas</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => api.download('/api/v1/reports/excel', 'reporte-actividades-cnr.xlsx')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium rounded-lg shadow-sm"
          >
            <Download className="w-4 h-4" />
            Exportar Excel
          </button>
          <Link
            href="/actividades"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#0f4c81] hover:bg-blue-900 text-white text-sm font-medium rounded-lg shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Nueva Actividad / OT
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-slate-500 uppercase">Total Actividades</div>
            <div className="text-3xl font-bold text-slate-800 mt-1">{data?.total ?? '—'}</div>
          </div>
          <div className="p-3 bg-blue-50 text-blue-700 rounded-xl"><ClipboardCheck className="w-6 h-6" /></div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-slate-500 uppercase">En Ejecución</div>
            <div className="text-3xl font-bold text-amber-600 mt-1">{countStatus('EN_EJECUCION')}</div>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl"><Clock className="w-6 h-6" /></div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-slate-500 uppercase">Cerradas / Aprobadas</div>
            <div className="text-3xl font-bold text-emerald-600 mt-1">{countStatus('CERRADA')}</div>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl"><CheckCircle2 className="w-6 h-6" /></div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-slate-500 uppercase">Prioridad Crítica</div>
            <div className="text-3xl font-bold text-red-600 mt-1">{countPriority('CRITICA')}</div>
          </div>
          <div className="p-3 bg-red-50 text-red-600 rounded-xl"><AlertTriangle className="w-6 h-6" /></div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-4">Actividades por Estado</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.byStatus ?? []}>
                <XAxis dataKey="status" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#0f4c81" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-4">Distribución por Tipo de Proceso</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data?.byType ?? []} dataKey="count" nameKey="typeName" cx="50%" cy="50%" outerRadius={85} label>
                  {(data?.byType ?? []).map((entry) => (
                    <Cell key={entry.typeId} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
          <h3 className="font-semibold text-slate-800">Últimas Actividades Registradas</h3>
          <Link href="/actividades" className="text-sm text-blue-700 hover:underline font-medium">Ver todas</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3">Folio</th>
                <th className="px-4 py-3">Título</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Responsable</th>
                <th className="px-4 py-3">Avance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recent.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">No hay actividades registradas aún.</td></tr>
              ) : (
                recent.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-semibold text-blue-700">
                      <Link href={`/actividades/${a.id}`}>{a.folio}</Link>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">{a.title}</td>
                    <td className="px-4 py-3">{a.type?.name}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">{a.status}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{a.assignee?.name || 'Sin asignar'}</td>
                    <td className="px-4 py-3">{a.progress}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
