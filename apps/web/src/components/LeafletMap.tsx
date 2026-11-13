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
  focusFeatureId,
  focusCenter,
  draftPoints,
  draftKind,
}: {
  features: MapFeatureItem[];
  height?: string;
  onSelectPoint?: (lat: number, lng: number) => void;
  focusFeatureId?: string | null;
  focusCenter?: { lat: number; lng: number; zoom?: number } | null;
  draftPoints?: [number, number][];
  draftKind?: 'POINT' | 'LINE' | 'POLYGON';
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const draftLayerRef = useRef<L.LayerGroup | null>(null);
  const layersByIdRef = useRef<Map<string, L.Layer>>(new Map());
  const onSelectRef = useRef(onSelectPoint);
  onSelectRef.current = onSelectPoint;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current).setView([-33.4489, -70.6693], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      onSelectRef.current?.(e.latlng.lat, e.latlng.lng);
    });

    const group = L.layerGroup().addTo(map);
    const draftGroup = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerRef.current = group;
    draftLayerRef.current = draftGroup;

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      draftLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerRef.current;
    if (!map || !group) return;

    group.clearLayers();
    layersByIdRef.current.clear();
    const bounds: L.LatLngExpression[] = [];

    for (const f of features) {
      const refLabel = (f.label || f.activityFolio || f.code || f.kind).slice(0, 28);
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
          color: '#0b3b60',
          fillColor: '#146c43',
          fillOpacity: 0.9,
          weight: 2,
        })
          .bindPopup(popupHtml)
          .bindTooltip(refLabel, { permanent: true, direction: 'top', offset: [0, -8], className: 'cnr-map-label' });
        marker.addTo(group);
        layersByIdRef.current.set(f.id, marker);
        bounds.push([lat, lng]);
      } else if (f.geometry.type === 'LineString') {
        const latlngs = (f.geometry.coordinates as [number, number][]).map(([lng, lat]) => [lat, lng] as [number, number]);
        const line = L.polyline(latlngs, { color: f.kind === 'TRACK' ? '#d97706' : '#0e7490', weight: 4 })
          .bindPopup(popupHtml)
          .bindTooltip(refLabel, { permanent: true, direction: 'center', className: 'cnr-map-label' })
          .addTo(group);
        layersByIdRef.current.set(f.id, line);
        bounds.push(...latlngs);
      } else if (f.geometry.type === 'Polygon') {
        const rings = (f.geometry.coordinates as [number, number][][]).map((ring) =>
          ring.map(([lng, lat]) => [lat, lng] as [number, number]),
        );
        const poly = L.polygon(rings, { color: '#146c43', fillOpacity: 0.25, weight: 2 })
          .bindPopup(popupHtml)
          .bindTooltip(refLabel, { permanent: true, direction: 'center', className: 'cnr-map-label' })
          .addTo(group);
        layersByIdRef.current.set(f.id, poly);
        if (rings[0]) bounds.push(...rings[0]);
      }
    }

    if (bounds.length > 0 && !focusFeatureId) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30], maxZoom: 15 });
    }
  }, [features]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusFeatureId) return;
    const layer = layersByIdRef.current.get(focusFeatureId) as any;
    if (!layer) return;

    if (typeof layer.getLatLng === 'function') {
      map.flyTo(layer.getLatLng(), 16, { duration: 0.6 });
    } else if (typeof layer.getBounds === 'function') {
      map.flyToBounds(layer.getBounds(), { padding: [40, 40], maxZoom: 16, duration: 0.6 });
    }
    if (typeof layer.openPopup === 'function') {
      layer.openPopup();
    }
  }, [focusFeatureId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusCenter) return;
    map.flyTo([focusCenter.lat, focusCenter.lng], focusCenter.zoom ?? 14, { duration: 0.6 });
  }, [focusCenter]);

  useEffect(() => {
    const draftGroup = draftLayerRef.current;
    if (!draftGroup) return;
    draftGroup.clearLayers();
    if (!draftPoints || draftPoints.length === 0) return;

    draftPoints.forEach(([lat, lng], idx) => {
      L.circleMarker([lat, lng], {
        radius: 6,
        color: '#b45309',
        fillColor: '#fbbf24',
        fillOpacity: 1,
        weight: 2,
      })
        .bindTooltip(`V${idx + 1}`, { permanent: true, direction: 'top', offset: [0, -6], className: 'cnr-map-label' })
        .addTo(draftGroup);
    });

    if (draftKind === 'LINE' && draftPoints.length >= 2) {
      L.polyline(draftPoints, { color: '#d97706', weight: 3, dashArray: '6, 6' }).addTo(draftGroup);
    } else if (draftKind === 'POLYGON' && draftPoints.length >= 2) {
      if (draftPoints.length >= 3) {
        L.polygon(draftPoints, { color: '#146c43', fillColor: '#22c55e', fillOpacity: 0.2, weight: 3, dashArray: '6, 6' }).addTo(draftGroup);
      } else {
        L.polyline(draftPoints, { color: '#146c43', weight: 3, dashArray: '6, 6' }).addTo(draftGroup);
      }
    }
  }, [draftPoints, draftKind]);

  return <div ref={containerRef} style={{ height, width: '100%' }} className="rounded-xl border border-slate-200 z-10" />;
}
