'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { DynamicFormRenderer } from '@/components/DynamicFormRenderer';
import { MapClient } from '@/components/MapClient';
import { api, API_BASE, getToken } from '@/lib/api';
import { FileText, MapPin, Upload, Save, CheckCircle } from 'lucide-react';

function ActividadDetailInner() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<any>(null);
  const [qrData, setQrData] = useState<{ payload: string; qrDataUrl: string } | null>(null);
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [comment, setComment] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api
      .get<any>(`/api/v1/activities/${id}`)
      .then((res) => {
        setDetail(res);
        setFormValues(res.activity.data ?? {});
      })
      .catch((e) => setError(e.message));
    api
      .get<{ payload: string; qrDataUrl: string }>(`/api/v1/activities/${id}/qr`)
      .then(setQrData)
      .catch(() => undefined);
  };

  useEffect(() => {
    if (id) load();
  }, [id]);

  const saveForm = async () => {
    setError(null);
    setMsg(null);
    try {
      await api.patch(`/api/v1/activities/${detail.activity.id}`, { data: formValues });
      setMsg('Formulario guardado correctamente.');
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const runTransition = async (transitionKey: string) => {
    setError(null);
    setMsg(null);
    try {
      await api.post(`/api/v1/activities/${detail.activity.id}/transitions`, {
        transition: transitionKey,
        comment: comment || undefined,
      });
      setComment('');
      setMsg('Transición ejecutada.');
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const generateDoc = async (kind: 'REPORT' | 'VOUCHER') => {
    setError(null);
    try {
      await api.post(`/api/v1/activities/${detail.activity.id}/documents`, { kind });
      setMsg(`${kind === 'VOUCHER' ? 'Comprobante' : 'Informe PDF'} generado con QR de verificación.`);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const addMapPoint = async (lat: number, lng: number) => {
    try {
      await api.post('/api/v1/geo', {
        id: crypto.randomUUID(),
        activityId: detail.activity.id,
        kind: 'POINT',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        label: `Punto Web (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
        accuracy: 5,
        capturedAt: new Date().toISOString(),
      });
      setMsg('Punto GPS agregado desde el mapa.');
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const uploadEvidence = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append(
      'meta',
      JSON.stringify({
        id: crypto.randomUUID(),
        activityId: detail.activity.id,
        kind: file.type.startsWith('image/') ? 'PHOTO' : 'FILE',
        fileName: file.name,
        mimeType: file.type,
        capturedAt: new Date().toISOString(),
        source: 'web-upload',
      }),
    );
    fd.append('file', file);
    try {
      await api.post('/api/v1/evidences', fd);
      setMsg('Evidencia subida y cifrada.');
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (!detail) {
    return (
      <AppShell title="Detalle de Actividad">
        <div className="p-8 text-center text-slate-500">{error || 'Cargando detalle...'}</div>
      </AppShell>
    );
  }

  const a = detail.activity;

  return (
    <AppShell title={`${a.folio} · ${a.title}`}>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}
      {msg && <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-sm">{msg}</div>}

      {/* Header & Workflow Actions */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm mb-6">
        <div className="flex flex-wrap justify-between gap-4 items-start">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-sm font-bold text-blue-700">{a.folio}</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">{a.status}</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">{a.priority}</span>
            </div>
            <h2 className="text-xl font-bold text-slate-800">{a.title}</h2>
            <p className="text-sm text-slate-500 mt-1">
              Proceso: {a.type?.name} · Unidad: {a.unit?.name || 'General'} · Asignado a: {a.assignee?.name || 'Sin asignar'} · Avance: {a.progress}%
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => generateDoc('VOUCHER')} className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50">
              <FileText className="w-4 h-4" /> Generar Voucher
            </button>
            <button onClick={() => generateDoc('REPORT')} className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#0f4c81] text-white rounded-lg text-sm hover:bg-blue-900">
              <FileText className="w-4 h-4" /> Informe PDF
            </button>
          </div>
        </div>

        {/* Available Workflow Transitions */}
        {detail.availableTransitions?.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-2">
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Comentario / observación para la transición..."
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm w-72"
            />
            {detail.availableTransitions.map((t: any) => (
              <button
                key={t.key}
                onClick={() => runTransition(t.key)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-sm rounded-lg"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                {t.label}
                {t.approvalLevel ? ` (N${t.approvalLevel})` : ''}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Dynamic Form */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-slate-800">Formulario Digital</h3>
            <button onClick={saveForm} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 text-white rounded-lg text-sm">
              <Save className="w-4 h-4" /> Guardar Datos
            </button>
          </div>
          {detail.formDefinition ? (
            <DynamicFormRenderer
              definition={detail.formDefinition}
              values={formValues}
              onChange={setFormValues}
              context={{ activity: a }}
            />
          ) : (
            <p className="text-sm text-slate-400">Esta actividad no tiene formulario asignado.</p>
          )}
        </div>

        {/* Map & GeoFeatures */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-700" /> Puntos Georreferenciados ({detail.geoFeatures?.length ?? 0})
            </h3>
            <span className="text-xs text-slate-400">Clic en el mapa para agregar punto</span>
          </div>
          <MapClient features={detail.geoFeatures ?? []} height="320px" onSelectPoint={addMapPoint} />
        </div>

        {/* Evidences */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-slate-800">Evidencias Digitales ({detail.evidences?.length ?? 0})</h3>
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm cursor-pointer">
              <Upload className="w-4 h-4" /> Adjuntar
              <input type="file" onChange={uploadEvidence} className="hidden" />
            </label>
          </div>
          <div className="space-y-2">
            {(detail.evidences ?? []).length === 0 ? (
              <p className="text-sm text-slate-400">Sin evidencias adjuntas.</p>
            ) : (
              detail.evidences.map((ev: any) => (
                <div key={ev.id} className="p-3 border border-slate-200 rounded-lg flex justify-between items-center text-sm">
                  <div>
                    <div className="font-medium">{ev.fileName || ev.kind}</div>
                    <div className="text-xs text-slate-500">
                      {new Date(ev.capturedAt).toLocaleString('es-CL')} · {ev.uploadedBy?.name || 'Usuario'} · SHA256: {ev.sha256?.slice(0, 12)}...
                    </div>
                  </div>
                  {ev.storageKey && (
                    <a
                      href={`${API_BASE}/api/v1/evidences/${ev.id}/file`}
                      onClick={async (e) => {
                        e.preventDefault();
                        const res = await fetch(`${API_BASE}/api/v1/evidences/${ev.id}/file`, {
                          headers: { Authorization: `Bearer ${getToken()}` },
                        });
                        const blob = await res.blob();
                        window.open(URL.createObjectURL(blob), '_blank');
                      }}
                      className="text-blue-700 hover:underline text-xs font-medium"
                    >
                      Ver archivo
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Documents & Traceability */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-5">
          {qrData && (
            <div className="p-3.5 rounded-xl border border-[#d8e3df] bg-[#f2f6f4] flex items-center gap-4">
              <img src={qrData.qrDataUrl} alt={`QR ${detail.activity.folio}`} className="w-24 h-24 rounded-lg border border-white shadow-sm bg-white p-1" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold uppercase tracking-wide text-[#0b3b60]">QR de Acceso Rápido (Terreno)</div>
                <div className="text-sm font-mono font-bold text-[#146c43] mt-0.5">{detail.activity.folio}</div>
                <p className="text-xs text-slate-600 mt-1">
                  Escanee este código desde la app móvil TerrenoCNR para abrir directamente los detalles de esta OT.
                </p>
                <a
                  href={qrData.qrDataUrl}
                  download={`qr-${detail.activity.folio}.png`}
                  className="inline-block mt-2 text-xs font-semibold text-[#0e7490] hover:underline"
                >
                  Descargar imagen QR →
                </a>
              </div>
            </div>
          )}

          <div>
            <h3 className="font-semibold text-slate-800 mb-3">Documentos y Comprobantes PDF</h3>
            {(detail.documents ?? []).length === 0 ? (
              <p className="text-sm text-slate-400">Sin documentos generados.</p>
            ) : (
              <div className="space-y-2">
                {detail.documents.map((d: any) => (
                  <div key={d.id} className="p-2.5 border rounded-lg flex justify-between items-center text-sm">
                    <div>
                      <span className="font-semibold">{d.kind}</span> · Código QR: <span className="font-mono text-xs">{d.verifyCode}</span>
                    </div>
                    <a
                      href={`${API_BASE}/api/v1/documents/${d.id}/download`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-700 hover:underline text-xs font-medium"
                    >
                      Descargar PDF
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="font-semibold text-slate-800 mb-3">Historial de Aprobaciones y Trazabilidad</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {(detail.transitionHistory ?? []).map((t: any) => (
                <div key={t.id} className="text-xs border-l-2 border-blue-600 pl-3 py-1">
                  <div className="font-semibold text-slate-800">
                    {t.label} ({t.fromStatus} → {t.toStatus}) {t.approvalLevel ? `· Nivel ${t.approvalLevel}` : ''}
                  </div>
                  <div className="text-slate-500">
                    {new Date(t.createdAt).toLocaleString('es-CL')} · {t.user?.name || 'Sistema'}
                    {t.comment ? ` — "${t.comment}"` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export default function ActividadDetailPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Cargando actividad...</div>}>
      <ActividadDetailInner />
    </Suspense>
  );
}
