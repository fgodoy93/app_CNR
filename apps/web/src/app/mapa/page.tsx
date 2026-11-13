'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { MapClient } from '@/components/MapClient';
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

  useEffect(() => {
    api.get<{ data: any[] }>('/api/v1/geo').then((r) => setFeatures(r.data)).catch(() => undefined);
  }, []);

  const filtered = kindFilter ? features.filter((f) => f.kind === kindFilter) : features;

  return (
    <AppShell title="Visualización Cartográfica y Exportación GPS">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          {KINDS.map((k) => {
            const cnt = k.key ? features.filter((f) => f.kind === k.key).length : features.length;
            return (
              <button
                key={k.key || 'ALL'}
                onClick={() => setKindFilter(k.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  kindFilter === k.key
                    ? 'bg-[#0b3b60] text-white border-[#0b3b60]'
                    : 'bg-white text-slate-600 border-[#d8e3df] hover:bg-slate-50'
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
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-[#d8e3df] hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700"
          >
            <Download className="w-3.5 h-3.5" /> GeoJSON
          </button>
          <button
            onClick={() => api.download('/api/v1/geo/export/kml', 'terreno-cnr.kml')}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-[#d8e3df] hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700"
          >
            <Download className="w-3.5 h-3.5" /> KML (Google Earth)
          </button>
          <button
            onClick={() => api.download('/api/v1/geo/export/csv', 'terreno-cnr.csv')}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#146c43] hover:bg-[#0f5434] text-white rounded-lg text-xs font-semibold"
          >
            <Download className="w-3.5 h-3.5" /> CSV (Excel/SIG)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-8">
          <MapClient features={filtered} height="560px" />
        </div>
        <div className="lg:col-span-4 bg-white rounded-xl border border-[#d8e3df] shadow-sm p-4 max-h-[560px] flex flex-col">
          <h3 className="font-semibold text-[#0b3b60] text-sm mb-3 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#146c43]" /> Registros en Mapa ({filtered.length})
          </h3>
          <div className="space-y-2.5 overflow-y-auto pr-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">Sin geometrías registradas.</p>
            ) : (
              filtered.map((f) => (
                <div key={f.id} className="p-3 rounded-lg border border-[#d8e3df] bg-[#f8fbfa] text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[#0e7490]">{f.kind}</span>
                    {f.activityId && (
                      <Link href={`/actividades/${f.activityId}`} className="text-[#146c43] font-semibold hover:underline">
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
