'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { DynamicFormRenderer } from '@/components/DynamicFormRenderer';
import { MapClient } from '@/components/MapClient';
import { api, API_BASE, getToken } from '@/lib/api';
import { closeRing, type Position } from '@terreno/shared';
import { FileText, MapPin, Upload, Save, CheckCircle, ArrowLeft, Undo2, Trash2 } from 'lucide-react';

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
        <Link href="/actividades" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0b3b60] hover:underline">
          <ArrowLeft className="w-3.5 h-3.5" /> Volver a Actividades y OT
        </Link>
      </div>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}
      {msg && <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-sm">{msg}</div>}

      {/* Header & Workflow Actions */}
      <div className="bg-white p-5 rounded-xl border border-[#d8e3df] shadow-sm mb-6">
        <div className="flex flex-wrap justify-between gap-4 items-start">
          <div className="flex-1 min-w-[260px]">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-sm font-bold text-[#0e7490]">{a.folio}</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-[#0b3b60]">{a.status}</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">{a.priority}</span>
            </div>
            <h2 className="text-xl font-bold text-[#0f241d]">{a.title}</h2>
            <p className="text-sm text-slate-500 mt-1">
              Proceso: {a.type?.name} · Unidad: {a.unit?.name || 'General'} · Asignado a: {a.assignee?.name || 'Sin asignar'}
            </p>
            <div className="mt-3 max-w-md flex items-center gap-3">
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-2 bg-[#146c43] rounded-full transition-all" style={{ width: `${Math.min(100, a.progress ?? 0)}%` }} />
              </div>
              <span className="text-xs font-bold text-[#146c43]">{a.progress ?? 0}%</span>
            </div>
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Columna Izquierda: Formulario + Evidencias */}
        <div className="lg:col-span-7 space-y-6">
          {/* Dynamic Form */}
          <div className="bg-white p-5 rounded-xl border border-[#d8e3df] shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-[#0b3b60]">Formulario Digital</h3>
              <button onClick={saveForm} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#146c43] hover:bg-[#0f5434] text-white rounded-lg text-sm font-medium">
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

          {/* Evidences */}
          <div className="bg-white p-5 rounded-xl border border-[#d8e3df] shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-[#0b3b60]">Evidencias Digitales ({detail.evidences?.length ?? 0})</h3>
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
                      {ev.storageKey && (
                        <a
                          href={`${API_BASE}/api/v1/evidences/${ev.id}/file`}
                          onClick={async (e) => {
                            e.preventDefault();
                            const res = await fetch(`${API_BASE}/api/v1/evidences/${ev.id}/file`, {
                              headers: { Authorization: `Bearer ${getToken()}` },
                            });
                            const blob = await res.blob();
                            const url = URL.createObjectURL(blob);
                            if (ev.kind === 'AUDIO') {
                              const audioEl = document.getElementById(`audio-${ev.id}`) as HTMLAudioElement | null;
                              if (audioEl) {
                                audioEl.src = url;
                                audioEl.classList.remove('hidden');
                                void audioEl.play();
                                return;
                              }
                            }
                            window.open(url, '_blank');
                          }}
                          className="text-[#0e7490] hover:underline text-xs font-medium shrink-0"
                        >
                          {ev.kind === 'AUDIO' ? 'Reproducir audio' : 'Ver archivo'}
                        </a>
                      )}
                    </div>
                    {ev.kind === 'AUDIO' && (
                      <audio id={`audio-${ev.id}`} controls className="w-full h-8 hidden" />
                    )}
                    {ev.transcript && (
                      <div className="text-xs bg-slate-50 border border-slate-200 rounded p-2 text-slate-700">
                        <span className="font-semibold text-[#0b3b60]">Transcripción:</span> {ev.transcript}
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
          <div className="bg-white p-5 rounded-xl border border-[#d8e3df] shadow-sm space-y-3">
            <div className="flex flex-wrap justify-between items-center gap-2">
              <h3 className="font-semibold text-[#0b3b60] flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#146c43]" /> Geometrías GPS ({detail.geoFeatures?.length ?? 0})
              </h3>
              <div className="inline-flex rounded-lg border border-[#d8e3df] p-0.5 bg-[#f2f6f4]">
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
                      drawKind === opt.key ? 'bg-[#0b3b60] text-white' : 'text-slate-600 hover:bg-white'
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
                  className="flex-1 px-3 py-1.5 border border-[#d8e3df] rounded-lg text-xs bg-white"
                />
                <button
                  type="button"
                  onClick={searchAddressOnWebMap}
                  disabled={searchingZone}
                  className="px-3 py-1.5 bg-[#0b3b60] hover:bg-[#0f4c81] text-white rounded-lg text-xs font-semibold"
                >
                  {searchingZone ? 'Buscando...' : 'Ir a zona'}
                </button>
              </div>
              {zoneSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 mt-1 bg-white border border-[#d8e3df] rounded-lg shadow-lg z-30 max-h-44 overflow-y-auto">
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
              className="w-full px-3 py-1.5 border border-[#d8e3df] rounded-lg text-xs bg-white"
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
                  className="flex-1 min-w-[115px] px-2.5 py-1.5 border border-[#d8e3df] rounded-lg text-xs"
                />
                <input
                  value={lngInput}
                  onChange={(e) => setLngInput(e.target.value)}
                  placeholder="Longitud (ej. -70.6693)"
                  className="flex-1 min-w-[115px] px-2.5 py-1.5 border border-[#d8e3df] rounded-lg text-xs"
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
                      className="inline-flex items-center gap-1 px-2.5 py-1 border border-[#d8e3df] rounded-md text-xs text-slate-600 hover:bg-slate-50"
                    >
                      <Undo2 className="w-3 h-3" /> Deshacer
                    </button>
                    <button
                      type="button"
                      onClick={() => setDraftPoints([])}
                      className="inline-flex items-center gap-1 px-2.5 py-1 border border-[#d8e3df] rounded-md text-xs text-red-600 hover:bg-red-50"
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
                    <div key={gf.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[#f8fbfa] border border-[#d8e3df] text-xs">
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
          <div className="bg-white p-5 rounded-xl border border-[#d8e3df] shadow-sm space-y-5">
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
