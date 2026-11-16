'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { MapClient } from '@/components/MapClient';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';
import { api } from '@/lib/api';
import { Download, MapPin } from 'lucide-react';

const KINDS = [
  { key: '', label: 'Todas' },
  { key: 'POINT', label: 'Puntos GPS' },
  { key: 'LINE', label: 'Líneas' },
  { key: 'TRACK', label: 'Recorridos' },
  { key: 'POLYGON', label: 'Polígonos' },
];

export default function MapaPage() {
  const [features, setFeatures] = useState<any[]>([]);
  const [kindFilter, setKindFilter] = useState('');
  const [q, setQ] = useState('');
  const [focusId, setFocusId] = useState<string | null>(null);
  const [searchAddr, setSearchAddr] = useState('');
  const [focusCenter, setFocusCenter] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);

  useEffect(() => {
    api.get<{ data: any[] }>('/api/v1/geo').then((r) => setFeatures(r.data)).catch(() => undefined);
  }, []);

  const filtered = features.filter((f) => {
    if (kindFilter && f.kind !== kindFilter) return false;
    if (!q.trim()) return true;
    const needle = q.trim().toLowerCase();
    return (
      f.activityFolio?.toLowerCase().includes(needle) ||
      f.activityTitle?.toLowerCase().includes(needle) ||
      f.label?.toLowerCase().includes(needle) ||
      f.code?.toLowerCase().includes(needle)
    );
  });

  return (
    <AppShell title="Visualización Cartográfica y Exportación GPS">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex flex-wrap items-center gap-2">
          {KINDS.map((k) => {
            const cnt = k.key ? features.filter((f) => f.kind === k.key).length : features.length;
            return (
              <button
                key={k.key || 'ALL'}
                onClick={() => setKindFilter(k.key)}
                className={`btn btn-default-size ${
                  kindFilter === k.key ? 'btn-primary' : 'btn-outline-secondary'
                }`}
              >
                {k.label} ({cnt})
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => api.download('/api/v1/geo/export/geojson', 'terreno-cnr.geojson')}
            className="btn btn-outline-secondary btn-default-size"
          >
            <Download className="w-4 h-4" /> GeoJSON
          </button>
          <button
            onClick={() => api.download('/api/v1/geo/export/kml', 'terreno-cnr.kml')}
            className="btn btn-outline-secondary btn-default-size"
          >
            <Download className="w-4 h-4" /> KML (Google Earth)
          </button>
          <button
            onClick={() => api.download('/api/v1/geo/export/csv', 'terreno-cnr.csv')}
            className="btn btn-success btn-default-size"
          >
            <Download className="w-4 h-4" /> CSV (Excel/SIG)
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-3 items-center">
        <div className="flex-1 min-w-[240px] max-w-md">
          <AddressAutocomplete
            value={searchAddr}
            onChange={setSearchAddr}
            onSelect={(item) => setFocusCenter({ lat: item.lat, lng: item.lng, zoom: 14 })}
            placeholder="Buscar dirección, comuna o zona en el mapa..."
          />
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filtrar por folio OT, título o etiqueta..."
          className="gob-input flex-1 min-w-[220px] max-w-xs"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-8">
          <MapClient features={filtered} height="560px" focusFeatureId={focusId} focusCenter={focusCenter} />
        </div>
        <div className="lg:col-span-4 bg-white rounded-xl border border-[#d9e2ec] shadow-sm p-4 max-h-[560px] flex flex-col">
          <h3 className="font-semibold text-[#006fb3] text-sm mb-3 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#146c43]" /> Registros en Mapa ({filtered.length})
          </h3>
          <div className="space-y-2.5 overflow-y-auto pr-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">Sin geometrías registradas.</p>
            ) : (
              filtered.map((f) => (
                <div
                  key={f.id}
                  onClick={() => setFocusId(f.id)}
                  className={`p-3 rounded-lg border text-xs space-y-1 cursor-pointer transition-colors ${
                    focusId === f.id
                      ? 'border-[#006fb3] bg-emerald-50/60 shadow-sm'
                      : 'border-[#d9e2ec] bg-[#f8fbfa] hover:border-[#0e7490]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[#0e7490]">
                      {f.kind} {f.activityFolio ? `· ${f.activityFolio}` : ''}
                    </span>
                    {f.activityId && (
                      <Link
                        href={`/actividades/${f.activityId}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-[#146c43] font-semibold hover:underline"
                      >
                        Ver OT →
                      </Link>
                    )}
                  </div>
                  <div className="font-semibold text-slate-800">{f.label || 'Sin etiqueta'}</div>
                  {f.observations && <div className="text-slate-500">{f.observations}</div>}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
