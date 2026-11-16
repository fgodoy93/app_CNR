'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { DynamicFormRenderer } from '@/components/DynamicFormRenderer';
import { SignaturePreview } from '@/components/SignaturePreview';
import { AuditDiffView } from '@/components/AuditDiffView';
import { MapClient } from '@/components/MapClient';
import { api, API_BASE, getToken } from '@/lib/api';
import { closeRing, type Position } from '@terreno/shared';
import { FileText, MapPin, Upload, Save, CheckCircle, ArrowLeft, Undo2, Trash2, Plus, GitBranch, RefreshCw } from 'lucide-react';

function ActividadDetailInner() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<any>(null);
  const [qrData, setQrData] = useState<{ payload: string; qrDataUrl: string } | null>(null);
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [comment, setComment] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drawKind, setDrawKind] = useState<'POINT' | 'LINE' | 'POLYGON'>('POINT');
  const [draftPoints, setDraftPoints] = useState<[number, number][]>([]);
  const [geoLabel, setGeoLabel] = useState('');
  const [latInput, setLatInput] = useState('');
  const [lngInput, setLngInput] = useState('');
  const [searchZone, setSearchZone] = useState('');
  const [searchingZone, setSearchingZone] = useState(false);
  const [zoneSuggestions, setZoneSuggestions] = useState<{ display_name: string; lat: string; lon: string }[]>([]);
  const [focusCenter, setFocusCenter] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);
  const [types, setTypes] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [showVisitModal, setShowVisitModal] = useState(false);
  const [creatingVisit, setCreatingVisit] = useState(false);
  const [visitForm, setVisitForm] = useState({ typeId: '', title: '', description: '', assigneeId: '', scheduledAt: '' });

  useEffect(() => {
    const q = searchZone.trim();
    if (q.length < 3) {
      setZoneSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&countrycodes=cl&limit=5&q=${encodeURIComponent(q)}`,
        );
        const data = (await res.json()) as { display_name: string; lat: string; lon: string }[];
        setZoneSuggestions(Array.isArray(data) ? data : []);
      } catch {
        setZoneSuggestions([]);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [searchZone]);

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
    api.get<{ data: any[] }>('/api/v1/admin/activity-types').then((r) => {
      setTypes(r.data);
      const vt = r.data.find((t: any) => t.prefix === 'VT' || t.key === 'visita_tecnica') || r.data[0];
      if (vt) setVisitForm((f) => ({ ...f, typeId: f.typeId || vt.id }));
    }).catch(() => undefined);
    api.get<{ data: any[] }>('/api/v1/admin/users').then((r) => setUsers(r.data)).catch(() => undefined);
  }, [id]);

  const createChildVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail?.activity || !visitForm.title.trim()) return;
    setCreatingVisit(true);
    setError(null);
    try {
      const parentAct = detail.activity;
      const vtTypeId = visitForm.typeId || parentAct.type?.id;
      const inheritedData =
        parentAct.data && typeof parentAct.data === 'object' && parentAct.data.codigo_cnr
          ? { codigo_cnr: parentAct.data.codigo_cnr }
          : undefined;
      await api.post('/api/v1/activities', {
        parentId: parentAct.id,
        typeId: vtTypeId,
        title: visitForm.title.trim(),
        description: visitForm.description.trim() || null,
        priority: parentAct.priority,
        assigneeId: visitForm.assigneeId || null,
        scheduledAt: visitForm.scheduledAt ? new Date(visitForm.scheduledAt).toISOString() : null,
        ...(inheritedData ? { data: inheritedData } : {}),
      });
      setShowVisitModal(false);
      setVisitForm((f) => ({ ...f, title: '', description: '', scheduledAt: '' }));
      setMsg('Visita técnica asociada creada correctamente.');
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreatingVisit(false);
    }
  };

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
      if (detail?.formDefinition) {
        await api.patch(`/api/v1/activities/${detail.activity.id}`, {
          data: formValues,
          baseVersion: detail.activity.version,
        });
      }
      await api.post(`/api/v1/activities/${detail.activity.id}/transitions`, {
        transition: transitionKey,
        comment: comment || undefined,
      });
      setComment('');
      setMsg('Formulario guardado y transición ejecutada.');
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const generateDoc = async (kind: 'REPORT' | 'VOUCHER') => {
    setError(null);
    try {
      const doc = await api.post<{ id: string; verifyCode: string }>(
        `/api/v1/activities/${detail.activity.id}/documents`,
        { kind },
      );
      await api.download(
        `/api/v1/documents/${doc.id}/download`,
        `${detail.activity.folio}-${kind === 'VOUCHER' ? 'comprobante' : 'informe'}.pdf`,
      );
      setMsg(`${kind === 'VOUCHER' ? 'Comprobante' : 'Informe PDF'} generado y descargado.`);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const addMapPoint = async (lat: number, lng: number) => {
    if (drawKind === 'POINT') {
      try {
        await api.post('/api/v1/geo', {
          id: crypto.randomUUID(),
          activityId: detail.activity.id,
          kind: 'POINT',
          geometry: { type: 'Point', coordinates: [lng, lat] },
          label: geoLabel.trim() || `Punto (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
          accuracy: 5,
          capturedAt: new Date().toISOString(),
        });
        setGeoLabel('');
        setMsg('Punto GPS agregado desde el mapa.');
        load();
      } catch (e: any) {
        setError(e.message);
      }
      return;
    }
    setDraftPoints((prev) => [...prev, [lat, lng]]);
  };

  const addManualCoord = () => {
    setError(null);
    const lat = Number(latInput.replace(',', '.'));
    const lng = Number(lngInput.replace(',', '.'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setError('Ingrese coordenadas válidas (ej. Lat -33.4489, Lng -70.6693).');
      return;
    }
    setLatInput('');
    setLngInput('');
    void addMapPoint(lat, lng);
  };

  const saveDraftGeometry = async () => {
    setError(null);
    if (drawKind === 'LINE' && draftPoints.length < 2) {
      setError('Una línea requiere al menos 2 vértices.');
      return;
    }
    if (drawKind === 'POLYGON' && draftPoints.length < 3) {
      setError('Un polígono requiere al menos 3 vértices.');
      return;
    }
    const coords: Position[] = draftPoints.map(([lat, lng]) => [lng, lat]);
    const geometry =
      drawKind === 'LINE'
        ? { type: 'LineString', coordinates: coords }
        : { type: 'Polygon', coordinates: [closeRing(coords)] };
    try {
      await api.post('/api/v1/geo', {
        id: crypto.randomUUID(),
        activityId: detail.activity.id,
        kind: drawKind,
        geometry,
        label: geoLabel.trim() || (drawKind === 'LINE' ? `Línea (${draftPoints.length} vértices)` : `Polígono (${draftPoints.length} vértices)`),
        accuracy: 5,
        capturedAt: new Date().toISOString(),
      });
      setDraftPoints([]);
      setGeoLabel('');
      setMsg(`${drawKind === 'LINE' ? 'Línea' : 'Polígono'} guardado en el mapa.`);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const deleteGeoFeature = async (geoId: string) => {
    setError(null);
    try {
      await api.delete(`/api/v1/geo/${geoId}`);
      setMsg('Geometría eliminada del mapa.');
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const clearAllGeoFeatures = async () => {
    setError(null);
    try {
      await api.delete(`/api/v1/geo/activity/${detail.activity.id}`);
      setDraftPoints([]);
      setMsg('Se limpiaron todas las geometrías de esta actividad.');
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const searchAddressOnWebMap = async () => {
    if (!searchZone.trim()) return;
    setSearchingZone(true);
    setError(null);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&countrycodes=cl&limit=1&q=${encodeURIComponent(searchZone.trim())}`,
      );
      const data = (await res.json()) as { lat: string; lon: string; display_name?: string }[];
      if (!data?.[0]) {
        setError(`No se encontró "${searchZone}" en Chile.`);
      } else {
        setFocusCenter({ lat: Number(data[0].lat), lng: Number(data[0].lon), zoom: 14 });
        setMsg(`Mapa centrado en: ${data[0].display_name || searchZone}`);
      }
    } catch {
      setError('No se pudo buscar la dirección (revise su conexión).');
    } finally {
      setSearchingZone(false);
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
      <div className="mb-4">
        <Link href="/actividades" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#006fb3] hover:underline">
          <ArrowLeft className="w-3.5 h-3.5" /> Volver a Actividades y OT
        </Link>
      </div>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}
      {msg && <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-sm">{msg}</div>}

      {/* Header & Workflow Actions */}
      <div className="bg-white p-5 rounded-xl border border-[#d9e2ec] shadow-sm mb-6">
        <div className="flex flex-wrap justify-between gap-4 items-start">
          <div className="flex-1 min-w-[260px]">
            {a.parent && (
              <div className="mb-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-sky-50 border border-sky-200 text-xs text-[#006fb3]">
                <GitBranch className="w-3.5 h-3.5" />
                <span>OT Principal:</span>
                <Link href={`/actividades/${a.parent.id}`} className="font-mono font-bold hover:underline">
                  {a.parent.folio}
                </Link>
                <span className="text-slate-600 truncate max-w-xs">— {a.parent.title}</span>
              </div>
            )}
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-sm font-bold text-[#0e7490]">{a.folio}</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-[#006fb3]">{a.status}</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">{a.priority}</span>
            </div>
            <h2 className="text-xl font-bold text-[#0f241d]">{a.title}</h2>
            <p className="text-sm text-slate-500 mt-1">
              Proceso: {a.type?.name} · Unidad: {a.unit?.name || 'General'} · Asignado a: {a.assignee?.name || 'Sin asignar'}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Creada: {new Date(a.createdAt).toLocaleString('es-CL')} · Por: <b>{a.createdBy?.name || 'Sistema'}</b>
              {a.updatedAt ? ` · Última actualización: ${new Date(a.updatedAt).toLocaleString('es-CL')}` : ''}
            </p>
            <div className="mt-3 max-w-md flex items-center gap-3">
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-2 bg-[#146c43] rounded-full transition-all" style={{ width: `${Math.min(100, a.progress ?? 0)}%` }} />
              </div>
              <span className="text-xs font-bold text-[#146c43]">{a.progress ?? 0}%</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => load()} className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50" title="Recargar últimos cambios sincronizados">
              <RefreshCw className="w-4 h-4" /> Actualizar
            </button>
            <button onClick={() => generateDoc('VOUCHER')} className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50">
              <FileText className="w-4 h-4" /> Generar Voucher
            </button>
            <button onClick={() => generateDoc('REPORT')} className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#0f69c4] text-white rounded-lg text-sm hover:bg-blue-900">
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

      {/* Visitas Técnicas Asociadas (Relación Padre-Hijo) */}
      {(!a.parent || (detail.visits?.length ?? 0) > 0) && (
        <div className="bg-white p-5 rounded-xl border border-[#d9e2ec] shadow-sm mb-6">
          <div className="flex flex-wrap justify-between items-center gap-3 mb-3">
            <div>
              <h3 className="font-semibold text-[#006fb3] flex items-center gap-2">
                <GitBranch className="w-4 h-4" />
                Visitas Técnicas / Sub-órdenes Asociadas ({detail.visits?.length ?? 0})
              </h3>
              <p className="text-xs text-slate-500">
                Registra múltiples salidas a terreno vinculadas a esta OT manteniendo ubicación y código de obra.
              </p>
            </div>
            {!a.parent && (
              <button
                onClick={() => {
                  const nextNum = (detail.visits?.length ?? 0) + 1;
                  setVisitForm((f) => ({
                    ...f,
                    title: f.title || `Visita Técnica #${nextNum} — ${a.title}`,
                  }));
                  setShowVisitModal(true);
                }}
                className="btn btn-primary btn-sm"
              >
                <Plus className="w-4 h-4" /> Programar Nueva Visita
              </button>
            )}
          </div>
          {detail.visits?.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {detail.visits.map((v: any) => (
                <Link
                  key={v.id}
                  href={`/actividades/${v.id}`}
                  className="block p-3 rounded-lg border border-slate-200 hover:border-[#006fb3] hover:bg-sky-50/30 transition"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-mono text-xs font-bold text-[#0e7490]">{v.folio}</span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-50 text-[#006fb3]">
                      {v.status}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-800 truncate">{v.title}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {v.assignee?.name || 'Sin asignar'} · {new Date(v.scheduledAt || v.createdAt).toLocaleDateString('es-CL')}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    GPS: {v.geoFeatureCount ?? 0} · Evidencias: {v.evidenceCount ?? 0}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">Aún no hay visitas técnicas asociadas a esta OT.</p>
          )}
        </div>
      )}

      {showVisitModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <form onSubmit={createChildVisit} className="bg-white rounded-xl border border-[#d9e2ec] shadow-xl w-full max-w-md p-5 space-y-3">
            <h3 className="text-base font-bold text-[#006fb3]">Nueva Visita Técnica para {a.folio}</h3>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de Actividad</label>
              <select
                value={visitForm.typeId}
                onChange={(e) => setVisitForm({ ...visitForm, typeId: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                {types.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.prefix})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Título de la visita *</label>
              <input
                required
                value={visitForm.title}
                onChange={(e) => setVisitForm({ ...visitForm, title: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Inspector asignado</label>
              <select
                value={visitForm.assigneeId}
                onChange={(e) => setVisitForm({ ...visitForm, assigneeId: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                <option value="">Sin asignar</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha programada</label>
              <input
                type="datetime-local"
                value={visitForm.scheduledAt}
                onChange={(e) => setVisitForm({ ...visitForm, scheduledAt: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Objetivo / Instrucciones</label>
              <textarea
                rows={2}
                value={visitForm.description}
                onChange={(e) => setVisitForm({ ...visitForm, description: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowVisitModal(false)} className="btn btn-secondary btn-sm">
                Cancelar
              </button>
              <button type="submit" disabled={creatingVisit} className="btn btn-primary btn-sm">
                {creatingVisit ? 'Creando...' : 'Crear Visita'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Columna Izquierda: Formulario + Evidencias */}
        <div className="lg:col-span-7 space-y-6">
          {/* Dynamic Form */}
          <div className="bg-white p-5 rounded-xl border border-[#d9e2ec] shadow-sm">
            <div className="sticky top-0 z-10 bg-white/95 backdrop-blur flex justify-between items-center pb-3 mb-4 border-b border-slate-100">
              <h3 className="font-semibold text-[#006fb3]">Formulario Digital</h3>
              <button onClick={saveForm} className="btn btn-success btn-sm">
                <Save className="w-4 h-4" /> Guardar Datos
              </button>
            </div>
            {detail.formDefinition ? (
              <DynamicFormRenderer
                definition={detail.formDefinition}
                values={formValues}
                onChange={setFormValues}
                context={{ activity: a }}
                evidences={detail.evidences ?? []}
                onTranscribeAudio={async (file) => {
                  const fd = new FormData();
                  fd.append('file', file);
                  const res = await api.post<{ text: string }>('/api/v1/evidences/transcribe', fd);
                  return res.text || '';
                }}
                onUploadFieldEvidence={async (fieldKey, kind, file, transcript) => {
                  const evId = crypto.randomUUID();
                  const fd = new FormData();
                  fd.append(
                    'meta',
                    JSON.stringify({
                      id: evId,
                      activityId: id,
                      kind,
                      fieldKey,
                      transcript: transcript || null,
                      capturedAt: new Date().toISOString(),
                      source: kind === 'AUDIO' ? 'recorder' : 'file',
                    }),
                  );
                  fd.append('file', file);
                  await api.post('/api/v1/evidences', fd);
                  await load();
                  return evId;
                }}
              />
            ) : (
              <p className="text-sm text-slate-400">Esta actividad no tiene formulario asignado.</p>
            )}
          </div>

          {/* Evidences */}
          <div className="bg-white p-5 rounded-xl border border-[#d9e2ec] shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-[#006fb3]">Evidencias Digitales ({detail.evidences?.length ?? 0})</h3>
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
                  <div key={ev.id} className="p-3 border border-slate-200 rounded-lg space-y-2 text-sm">
                    <div className="flex justify-between items-center gap-2">
                      <div>
                        <div className="font-medium">
                          {ev.kind === 'AUDIO' ? '🎙️ ' : ''}
                          {ev.fileName || ev.kind}
                        </div>
                        <div className="text-xs text-slate-500">
                          {new Date(ev.capturedAt).toLocaleString('es-CL')} · {ev.uploadedBy?.name || 'Usuario'} · SHA256: {ev.sha256?.slice(0, 12)}...
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {ev.storageKey && (
                          <a
                            href={`${API_BASE}/api/v1/evidences/${ev.id}/file`}
                            onClick={async (e) => {
                              e.preventDefault();
                              const res = await fetch(`${API_BASE}/api/v1/evidences/${ev.id}/file`, {
                                headers: { Authorization: `Bearer ${getToken()}` },
                              });
                              if (!res.ok) {
                                setError(`No se pudo cargar el archivo (${res.status})`);
                                return;
                              }
                              const rawBlob = await res.blob();
                              const blob =
                                ev.kind === 'AUDIO' && (!rawBlob.type || rawBlob.type === 'application/octet-stream')
                                  ? new Blob([rawBlob], { type: ev.mimeType?.split(';')[0] || 'audio/mp4' })
                                  : rawBlob;
                              const url = URL.createObjectURL(blob);
                              if (ev.kind === 'AUDIO') {
                                const audioEl = document.getElementById(`audio-${ev.id}`) as HTMLAudioElement | null;
                                if (audioEl) {
                                  audioEl.src = url;
                                  audioEl.classList.remove('hidden');
                                  audioEl.load();
                                  void audioEl.play().catch(() => undefined);
                                  return;
                                }
                              }
                              window.open(url, '_blank');
                            }}
                            className="text-[#006fb3] hover:underline text-xs font-medium"
                          >
                            {ev.kind === 'AUDIO' ? 'Reproducir audio' : 'Ver archivo'}
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={async () => {
                            if (ev.kind === 'AUDIO') {
                              const next = window.prompt('Editar transcripción del audio:', ev.transcript || '');
                              if (next === null) return;
                              await api.patch(`/api/v1/evidences/${ev.id}`, { transcript: next });
                            } else if (ev.kind === 'SIGNATURE') {
                              const next = window.prompt('Nombre o referencia de la firma:', ev.fileName || 'Firma en terreno');
                              if (next === null) return;
                              await api.patch(`/api/v1/evidences/${ev.id}`, { fileName: next });
                            } else {
                              const next = window.prompt('Editar observación / nota:', ev.note || '');
                              if (next === null) return;
                              await api.patch(`/api/v1/evidences/${ev.id}`, { note: next });
                            }
                            setMsg('Evidencia actualizada (trazabilidad registrada).');
                            load();
                          }}
                          className="text-xs font-medium text-slate-600 hover:text-[#006fb3]"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!window.confirm('¿Eliminar esta evidencia? El cambio quedará registrado en la trazabilidad.')) return;
                            await api.delete(`/api/v1/evidences/${ev.id}`);
                            setMsg('Evidencia eliminada (trazabilidad registrada).');
                            load();
                          }}
                          className="text-xs font-medium text-[#e22c2c] hover:underline"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                    {ev.kind === 'SIGNATURE' && ev.note && (
                      <div className="pt-1">
                        <SignaturePreview note={ev.note} />
                      </div>
                    )}
                    {ev.kind === 'AUDIO' && (
                      <audio id={`audio-${ev.id}`} controls className="w-full h-8 hidden" />
                    )}
                    {ev.transcript && (
                      <div className="text-xs bg-slate-50 border border-slate-200 rounded p-2 text-slate-700">
                        <span className="font-semibold text-[#006fb3]">Transcripción:</span> {ev.transcript}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Columna Derecha: QR, Mapa, Documentos y Trazabilidad */}
        <div className="lg:col-span-5 space-y-6">
          {/* Map & GeoFeatures */}
          <div className="bg-white p-5 rounded-xl border border-[#d9e2ec] shadow-sm space-y-3">
            <div className="flex flex-wrap justify-between items-center gap-2">
              <h3 className="font-semibold text-[#006fb3] flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#146c43]" /> Geometrías GPS ({detail.geoFeatures?.length ?? 0})
              </h3>
              <div className="inline-flex rounded-lg border border-[#d9e2ec] p-0.5 bg-[#f2f6f4]">
                {([
                  { key: 'POINT', label: 'Punto' },
                  { key: 'LINE', label: 'Línea' },
                  { key: 'POLYGON', label: 'Polígono' },
                ] as const).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      setDrawKind(opt.key);
                      setDraftPoints([]);
                    }}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                      drawKind === opt.key ? 'bg-[#006fb3] text-white' : 'text-slate-600 hover:bg-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="flex gap-2">
                <input
                  value={searchZone}
                  onChange={(e) => setSearchZone(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchAddressOnWebMap()}
                  placeholder="Buscar dirección, comuna o zona (ej. Talca, Rancagua)..."
                  className="flex-1 px-3 py-1.5 border border-[#d9e2ec] rounded-lg text-xs bg-white"
                />
                <button
                  type="button"
                  onClick={searchAddressOnWebMap}
                  disabled={searchingZone}
                  className="px-3 py-1.5 bg-[#006fb3] hover:bg-[#0f69c4] text-white rounded-lg text-xs font-semibold"
                >
                  {searchingZone ? 'Buscando...' : 'Ir a zona'}
                </button>
              </div>
              {zoneSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 mt-1 bg-white border border-[#d9e2ec] rounded-lg shadow-lg z-30 max-h-44 overflow-y-auto">
                  {zoneSuggestions.map((s, idx) => (
                    <button
                      key={`${s.lat}-${s.lon}-${idx}`}
                      type="button"
                      onClick={() => {
                        setFocusCenter({ lat: Number(s.lat), lng: Number(s.lon), zoom: 15 });
                        setSearchZone(s.display_name.split(',')[0] ?? s.display_name);
                        setZoneSuggestions([]);
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-emerald-50 border-b last:border-b-0 border-slate-100 truncate"
                    >
                      📍 {s.display_name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <input
              value={geoLabel}
              onChange={(e) => setGeoLabel(e.target.value)}
              placeholder={`Etiqueta de referencia para ${drawKind === 'POINT' ? 'el punto' : drawKind === 'LINE' ? 'la línea' : 'el polígono'} (opcional)`}
              className="w-full px-3 py-1.5 border border-[#d9e2ec] rounded-lg text-xs bg-white"
            />

            <MapClient
              features={detail.geoFeatures ?? []}
              height="280px"
              onSelectPoint={addMapPoint}
              focusCenter={focusCenter}
              draftPoints={draftPoints}
              draftKind={drawKind}
            />

            {/* Ingreso por coordenadas manuales */}
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <div className="text-[11px] font-semibold text-slate-500">
                {drawKind === 'POINT'
                  ? 'Haz clic en el mapa o ingresa coordenadas exactas:'
                  : `Haz clic en el mapa para agregar vértices (${draftPoints.length}) o ingrésalos por coordenadas:`}
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <input
                  value={latInput}
                  onChange={(e) => setLatInput(e.target.value)}
                  placeholder="Latitud (ej. -33.4489)"
                  className="flex-1 min-w-[115px] px-2.5 py-1.5 border border-[#d9e2ec] rounded-lg text-xs"
                />
                <input
                  value={lngInput}
                  onChange={(e) => setLngInput(e.target.value)}
                  placeholder="Longitud (ej. -70.6693)"
                  className="flex-1 min-w-[115px] px-2.5 py-1.5 border border-[#d9e2ec] rounded-lg text-xs"
                />
                <button
                  type="button"
                  onClick={addManualCoord}
                  className="px-3 py-1.5 bg-[#0e7490] hover:bg-[#0b5c73] text-white rounded-lg text-xs font-semibold"
                >
                  {drawKind === 'POINT' ? '+ Agregar Punto' : '+ Vértice'}
                </button>
              </div>

              {drawKind !== 'POINT' && draftPoints.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setDraftPoints((p) => p.slice(0, -1))}
                      className="inline-flex items-center gap-1 px-2.5 py-1 border border-[#d9e2ec] rounded-md text-xs text-slate-600 hover:bg-slate-50"
                    >
                      <Undo2 className="w-3 h-3" /> Deshacer
                    </button>
                    <button
                      type="button"
                      onClick={() => setDraftPoints([])}
                      className="inline-flex items-center gap-1 px-2.5 py-1 border border-[#d9e2ec] rounded-md text-xs text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-3 h-3" /> Limpiar
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={saveDraftGeometry}
                    className="px-3 py-1.5 bg-[#146c43] hover:bg-[#0f5434] text-white rounded-lg text-xs font-semibold"
                  >
                    Guardar {drawKind === 'LINE' ? 'Línea' : 'Polígono'} ({draftPoints.length})
                  </button>
                </div>
              )}
            </div>

            {/* Lista de geometrías guardadas con botón Eliminar / Limpiar todo */}
            {(detail.geoFeatures ?? []).length > 0 && (
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Elementos guardados ({detail.geoFeatures.length})
                  </span>
                  <button
                    type="button"
                    onClick={clearAllGeoFeatures}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 hover:underline"
                  >
                    <Trash2 className="w-3 h-3" /> Limpiar todos
                  </button>
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                  {detail.geoFeatures.map((gf: any) => (
                    <div key={gf.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[#f8fbfa] border border-[#d9e2ec] text-xs">
                      <div className="min-w-0">
                        <span className="font-bold text-[#0e7490] mr-1.5">{gf.kind}</span>
                        <span className="text-slate-700 truncate">{gf.label || gf.code}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteGeoFeature(gf.id)}
                        className="text-red-600 hover:text-red-800 p-1 shrink-0"
                        title="Borrar geometría"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Documents & Traceability */}
          <div className="bg-white p-5 rounded-xl border border-[#d9e2ec] shadow-sm space-y-5">
          {qrData && (
            <div className="p-3.5 rounded-xl border border-[#d9e2ec] bg-[#f2f6f4] flex items-center gap-4">
              <img src={qrData.qrDataUrl} alt={`QR ${detail.activity.folio}`} className="w-24 h-24 rounded-lg border border-white shadow-sm bg-white p-1" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold uppercase tracking-wide text-[#006fb3]">QR de Acceso Rápido (Terreno)</div>
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
            <h3 className="font-semibold text-[#006fb3] mb-3">Historial de Aprobaciones y Trazabilidad</h3>
            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {(detail.transitionHistory ?? []).map((t: any) => (
                <div key={t.id} className="text-xs border-l-2 border-violet-600 pl-3 py-1">
                  <div className="font-semibold text-slate-800">
                    {t.label} ({t.fromStatus} → {t.toStatus}) {t.approvalLevel ? `· Nivel ${t.approvalLevel}` : ''}
                  </div>
                  <div className="text-slate-500">
                    {new Date(t.createdAt).toLocaleString('es-CL')} · Usuario: <b>{t.user?.name || 'Sistema'}</b>
                    {t.comment ? ` — "${t.comment}"` : ''}
                  </div>
                </div>
              ))}
              {(detail.auditLogs ?? []).map((log: any) => (
                <AuditDiffView key={log.id} log={log} />
              ))}
            </div>
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
