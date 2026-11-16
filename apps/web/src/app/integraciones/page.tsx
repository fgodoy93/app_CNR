'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { api, API_BASE } from '@/lib/api';
import { Key, Webhook, Terminal, Link2 } from 'lucide-react';

export default function IntegracionesPage() {
  const [clients, setClients] = useState<any[]>([]);
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [connectors, setConnectors] = useState<any[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [whForm, setWhForm] = useState({ name: '', url: '', events: '*' });
  const [connForm, setConnForm] = useState({ key: '', name: '', urlTemplate: '' });

  const load = () => {
    api.get<{ data: any[] }>('/api/v1/integrations/api-clients').then((r) => setClients(r.data)).catch(() => undefined);
    api.get<{ data: any[] }>('/api/v1/integrations/webhooks').then((r) => setWebhooks(r.data)).catch(() => undefined);
    api.get<{ data: any[] }>('/api/v1/integrations/webhooks/deliveries').then((r) => setDeliveries(r.data)).catch(() => undefined);
    api.get<{ data: any[] }>('/api/v1/integrations/connectors').then((r) => setConnectors(r.data)).catch(() => undefined);
  };

  useEffect(() => {
    load();
  }, []);

  const createApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await api.post<{ apiKey: string }>('/api/v1/integrations/api-clients', { name: newKeyName, scopes: ['*'] });
    setCreatedKey(res.apiKey);
    setNewKeyName('');
    load();
  };

  const createWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post('/api/v1/integrations/webhooks', {
      name: whForm.name,
      url: whForm.url,
      events: whForm.events.split(',').map((s) => s.trim()),
    });
    setWhForm({ name: '', url: '', events: '*' });
    load();
  };

  const createConnector = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post('/api/v1/integrations/connectors', {
      key: connForm.key,
      name: connForm.name,
      urlTemplate: connForm.urlTemplate,
    });
    setConnForm({ key: '', name: '', urlTemplate: '' });
    load();
  };

  return (
    <AppShell title="Integración con Sistemas Institucionales (REST, Webhooks, MCP)">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* API Keys */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2"><Key className="w-4 h-4 text-blue-700" /> API Keys (REST Bidireccional)</h3>
          <form onSubmit={createApiKey} className="flex gap-2">
            <input value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder="Nombre sistema externo (ej. SIG CNR)" className="flex-1 px-3 py-2 border rounded-lg text-sm" required />
            <button type="submit" className="btn btn-primary btn-default-size">Generar</button>
          </form>
          {createdKey && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs">
              <div className="font-bold text-amber-900">Guarde esta API Key (no se volverá a mostrar):</div>
              <code className="block mt-1 font-mono break-all select-all">{createdKey}</code>
            </div>
          )}
          <div className="space-y-2 text-sm">
            {clients.map((c) => (
              <div key={c.id} className="p-2.5 border rounded-lg flex justify-between items-center">
                <div>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-slate-500 font-mono">tc_{c.keyPrefix}_...</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded ${c.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                  {c.active ? 'Activa' : 'Revocada'}
                </span>
              </div>
            ))}
          </div>
          <div className="pt-2 text-xs text-slate-500">
            Documentación OpenAPI / Swagger: <a href={`${API_BASE}/docs`} target="_blank" rel="noreferrer" className="text-blue-700 underline">{API_BASE}/docs</a>
          </div>
        </div>

        {/* Webhooks */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2"><Webhook className="w-4 h-4 text-blue-700" /> Webhooks Firmados (HMAC-SHA256)</h3>
          <form onSubmit={createWebhook} className="space-y-2">
            <input value={whForm.name} onChange={(e) => setWhForm({ ...whForm, name: e.target.value })} placeholder="Nombre suscripción" className="w-full px-3 py-2 border rounded-lg text-sm" required />
            <input type="url" value={whForm.url} onChange={(e) => setWhForm({ ...whForm, url: e.target.value })} placeholder="https://sistema.cnr.gob.cl/webhook" className="w-full px-3 py-2 border rounded-lg text-sm" required />
            <div className="flex gap-2">
              <input value={whForm.events} onChange={(e) => setWhForm({ ...whForm, events: e.target.value })} placeholder="Eventos (* o activity.closed)" className="flex-1 px-3 py-2 border rounded-lg text-sm" />
              <button type="submit" className="btn btn-primary btn-default-size">Suscribir</button>
            </div>
          </form>
          <div className="space-y-2 text-sm">
            {webhooks.map((w) => (
              <div key={w.id} className="p-2.5 border rounded-lg">
                <div className="font-medium">{w.name}</div>
                <div className="text-xs text-slate-500 truncate">{w.url}</div>
              </div>
            ))}
          </div>
        </div>

        {/* External Connectors */}
        <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2"><Link2 className="w-4 h-4 text-blue-700" /> Conectores de Consulta y Precarga Externa</h3>
          <form onSubmit={createConnector} className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <input value={connForm.key} onChange={(e) => setConnForm({ ...connForm, key: e.target.value })} placeholder="clave (ej. ley18450)" className="px-3 py-2 border rounded-lg text-sm font-mono" required />
            <input value={connForm.name} onChange={(e) => setConnForm({ ...connForm, name: e.target.value })} placeholder="Nombre sistema" className="px-3 py-2 border rounded-lg text-sm" required />
            <input type="url" value={connForm.urlTemplate} onChange={(e) => setConnForm({ ...connForm, urlTemplate: e.target.value })} placeholder="https://api.cnr.gob.cl/proyectos?q={{query}}" className="px-3 py-2 border rounded-lg text-sm" required />
            <button type="submit" className="btn btn-primary btn-default-size">Agregar Conector</button>
          </form>
          <div className="space-y-2 text-sm">
            {connectors.length === 0 ? (
              <p className="text-xs text-slate-400">Sin conectores externos configurados aún.</p>
            ) : (
              connectors.map((c) => (
                <div key={c.id} className="p-2.5 border rounded-lg flex justify-between items-center">
                  <div>
                    <span className="font-medium">{c.name}</span> <span className="font-mono text-xs text-slate-400">({c.key})</span>
                    <div className="text-xs text-slate-500 font-mono">{c.method} {c.urlTemplate}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* MCP Server Info */}
        <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2 mb-2"><Terminal className="w-4 h-4 text-blue-700" /> Servidor MCP (Model Context Protocol)</h3>
          <p className="text-sm text-slate-600 mb-3">
            Exposición nativa de herramientas de consulta y creación de órdenes de trabajo para agentes institucionales e interoperabilidad estándar.
          </p>
          <pre className="bg-slate-900 text-slate-100 p-3 rounded-lg text-xs overflow-x-auto">
{`npm run mcp:stdio -w @terreno/api
Herramientas disponibles: list_activities, get_activity, create_work_order, get_geo_features`}
          </pre>
        </div>

        {/* Deliveries Log */}
        <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-3">Historial de Entregas Webhook (con Reintentos)</h3>
          <div className="overflow-x-auto">
          <table className="w-full text-xs text-left min-w-[520px]">
            <thead className="bg-slate-50 text-slate-500 uppercase">
              <tr>
                <th className="px-3 py-2">Evento</th>
                <th className="px-3 py-2">Destino</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Intentos</th>
                <th className="px-3 py-2">HTTP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {deliveries.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-400">Sin entregas registradas.</td></tr>
              ) : (
                deliveries.map((d) => (
                  <tr key={d.id}>
                    <td className="px-3 py-2 font-mono">{d.event}</td>
                    <td className="px-3 py-2">{d.subscription?.name}</td>
                    <td className="px-3 py-2 font-semibold">{d.status}</td>
                    <td className="px-3 py-2">{d.attempts}</td>
                    <td className="px-3 py-2">{d.responseCode || d.lastError || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
