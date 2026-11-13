'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface MapFeatureItem {
  id: string;
  code: string;
  kind: 'POINT' | 'LINE' | 'POLYGON' | 'TRACK';
  geometry: {
    type: 'Point' | 'LineString' | 'Polygon';
    coordinates: any;
  };
  label?: string | null;
  status?: string | null;
  observations?: string | null;
  accuracy?: number | null;
  activityFolio?: string | null;
  activityTitle?: string | null;
  evidenceCount?: number;
}

export function LeafletMap({
  features,
  height = '480px',
  onSelectPoint,
}: {
  features: MapFeatureItem[];
  height?: string;
  onSelectPoint?: (lat: number, lng: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current).setView([-33.4489, -70.6693], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    if (onSelectPoint) {
      map.on('click', (e: L.LeafletMouseEvent) => {
        onSelectPoint(e.latlng.lat, e.latlng.lng);
      });
    }

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerRef.current = group;

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [onSelectPoint]);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerRef.current;
    if (!map || !group) return;

    group.clearLayers();
    const bounds: L.LatLngExpression[] = [];

    for (const f of features) {
      const popupHtml = `
        <div style="font-family:sans-serif;font-size:12px;min-width:180px">
          <strong>${f.code}</strong> ${f.label ? `· ${f.label}` : ''}<br/>
          ${f.activityFolio ? `<span>Folio: <b>${f.activityFolio}</b></span><br/>` : ''}
          <span>Tipo: ${f.kind}${f.status ? ` · Estado: ${f.status}` : ''}</span><br/>
          ${f.accuracy != null ? `<span>Precisión GPS: ±${f.accuracy} m</span><br/>` : ''}
          ${f.evidenceCount != null ? `<span>Evidencias: ${f.evidenceCount}</span><br/>` : ''}
          ${f.observations ? `<p style="margin:4px 0 0;color:#475569">${f.observations}</p>` : ''}
        </div>
      `;

      if (f.geometry.type === 'Point') {
        const [lng, lat] = f.geometry.coordinates as [number, number];
        const marker = L.circleMarker([lat, lng], {
          radius: 8,
          color: '#0f4c81',
          fillColor: '#0284c7',
          fillOpacity: 0.85,
          weight: 2,
        }).bindPopup(popupHtml);
        marker.addTo(group);
        bounds.push([lat, lng]);
      } else if (f.geometry.type === 'LineString') {
        const latlngs = (f.geometry.coordinates as [number, number][]).map(([lng, lat]) => [lat, lng] as [number, number]);
        L.polyline(latlngs, { color: f.kind === 'TRACK' ? '#f59e0b' : '#0284c7', weight: 4 })
          .bindPopup(popupHtml)
          .addTo(group);
        bounds.push(...latlngs);
      } else if (f.geometry.type === 'Polygon') {
        const rings = (f.geometry.coordinates as [number, number][][]).map((ring) =>
          ring.map(([lng, lat]) => [lat, lng] as [number, number]),
        );
        L.polygon(rings, { color: '#10b981', fillOpacity: 0.25, weight: 2 })
          .bindPopup(popupHtml)
          .addTo(group);
        if (rings[0]) bounds.push(...rings[0]);
      }
    }

    if (bounds.length > 0) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30], maxZoom: 15 });
    }
  }, [features]);

  return <div ref={containerRef} style={{ height, width: '100%' }} className="rounded-xl border border-slate-200 z-10" />;
}
