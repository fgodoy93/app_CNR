'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { MapClient } from '@/components/MapClient';
import { api } from '@/lib/api';
import { Download } from 'lucide-react';

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
        <div className="flex items-center gap-2">
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
          >
            <option value="">Todas las geometrías ({features.length})</option>
            <option value="POINT">Puntos GPS</option>
            <option value="LINE">Líneas</option>
            <option value="TRACK">Recorridos</option>
            <option value="POLYGON">Polígonos</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => api.download('/api/v1/geo/export/geojson', 'terreno-cnr.geojson')}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg text-sm font-medium"
          >
            <Download className="w-4 h-4" /> GeoJSON
          </button>
          <button
            onClick={() => api.download('/api/v1/geo/export/kml', 'terreno-cnr.kml')}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg text-sm font-medium"
          >
            <Download className="w-4 h-4" /> KML (Google Earth)
          </button>
          <button
            onClick={() => api.download('/api/v1/geo/export/csv', 'terreno-cnr.csv')}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#0f4c81] hover:bg-blue-900 text-white rounded-lg text-sm font-medium"
          >
            <Download className="w-4 h-4" /> CSV (Excel/SIG)
          </button>
        </div>
      </div>

      <MapClient features={filtered} height="560px" />
    </AppShell>
  );
}
