'use client';

import dynamic from 'next/dynamic';
import type { MapFeatureItem } from './LeafletMap';

const InnerMap = dynamic(() => import('./LeafletMap').then((m) => m.LeafletMap), {
  ssr: false,
  loading: () => <div className="h-[480px] w-full bg-slate-100 rounded-xl animate-pulse flex items-center justify-center text-sm text-slate-400">Cargando mapa cartográfico...</div>,
});

export function MapClient(props: {
  features: MapFeatureItem[];
  height?: string;
  onSelectPoint?: (lat: number, lng: number) => void;
  focusFeatureId?: string | null;
  draftPoints?: [number, number][];
  draftKind?: 'POINT' | 'LINE' | 'POLYGON';
}) {
  return <InnerMap {...props} />;
}
