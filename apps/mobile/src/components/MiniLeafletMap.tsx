import React, { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { Position } from '@terreno/shared';
import { COLORS } from '../theme';

export function MiniLeafletMap({
  geoFeatures = [],
  draftPoints = [],
  draftKind = 'POINT',
  centerLat = -33.4489,
  centerLng = -70.6693,
  userLat = null,
  userLng = null,
  focusCoords = null,
  height = 200,
  onTapCoordinate,
}: {
  geoFeatures?: any[];
  draftPoints?: Position[];
  draftKind?: 'POINT' | 'LINE' | 'TRACK' | 'POLYGON';
  centerLat?: number | null;
  centerLng?: number | null;
  userLat?: number | null;
  userLng?: number | null;
  focusCoords?: { lat: number; lng: number; zoom?: number } | null;
  height?: number;
  onTapCoordinate?: (lng: number, lat: number) => void;
}) {
  const webViewRef = useRef<any>(null);

  const draftLatLngs = useMemo(() => draftPoints.map(([lng, lat]) => [lat, lng]), [draftPoints]);

  // HTML base: solo se regenera si cambian las geometrías guardadas o el centro de la OT,
  // evitando que el mapa recargue y salte al marcar vértices/puntos.
  const html = useMemo(() => {
    const feats = geoFeatures
      .map((g) => {
        try {
          return { kind: g.kind, label: g.label || g.kind, geometry: JSON.parse(g.geometry) };
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const cLat = focusCoords?.lat ?? (typeof userLat === 'number' ? userLat : typeof centerLat === 'number' ? centerLat : -33.4489);
    const cLng = focusCoords?.lng ?? (typeof userLng === 'number' ? userLng : typeof centerLng === 'number' ? centerLng : -70.6693);
    const initZoom = focusCoords?.zoom ?? (typeof userLat === 'number' ? 16 : 13);

    return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #e8f0ec; }
    .cnr-map-label {
      background: rgba(255,255,255,0.95);
      border: 1px solid #0b3b60;
      color: #0b3b60;
      font-size: 10px;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: 5px;
      white-space: nowrap;
    }
    .cnr-user-label {
      background: #2563eb;
      border: 1px solid #ffffff;
      color: #ffffff;
      font-size: 10px;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: 5px;
      white-space: nowrap;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map').setView([${cLat}, ${cLng}], ${initZoom});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    var bounds = [];

    var userLayer = L.layerGroup().addTo(map);
    var draftLayer = L.layerGroup().addTo(map);

    window.updateUserPos = function(uLat, uLng) {
      userLayer.clearLayers();
      if (typeof uLat === 'number' && typeof uLng === 'number') {
        L.circle([uLat, uLng], { radius: 45, color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.15, weight: 1 }).addTo(userLayer);
        L.circleMarker([uLat, uLng], { radius: 7, color: '#ffffff', fillColor: '#2563eb', fillOpacity: 1, weight: 2.5 })
          .addTo(userLayer)
          .bindTooltip('Mi ubicación', { permanent: true, direction: 'top', offset: [0, -8], className: 'cnr-user-label' });
      }
    };

    window.updateDraft = function(draft, draftKind) {
      draftLayer.clearLayers();
      (draft || []).forEach(function(pt, idx) {
        L.circleMarker(pt, { radius: 6, color: '#b45309', fillColor: '#fbbf24', fillOpacity: 1, weight: 2 })
          .addTo(draftLayer)
          .bindTooltip('V' + (idx + 1), { permanent: true, direction: 'top', offset: [0, -6], className: 'cnr-map-label' });
      });
      if ((draftKind === 'LINE' || draftKind === 'TRACK') && draft.length >= 2) {
        L.polyline(draft, { color: '#d97706', weight: 3, dashArray: '5,5' }).addTo(draftLayer);
      } else if (draftKind === 'POLYGON' && draft.length >= 2) {
        if (draft.length >= 3) {
          L.polygon(draft, { color: '#146c43', fillColor: '#22c55e', fillOpacity: 0.2, weight: 3, dashArray: '5,5' }).addTo(draftLayer);
        } else {
          L.polyline(draft, { color: '#146c43', weight: 3, dashArray: '5,5' }).addTo(draftLayer);
        }
      }
    };

    window.focusMap = function(lat, lng, zoom) {
      if (typeof lat === 'number' && typeof lng === 'number') {
        map.setView([lat, lng], zoom || 16);
      }
    };

    window.updateUserPos(${typeof userLat === 'number' ? userLat : 'null'}, ${typeof userLng === 'number' ? userLng : 'null'});

    var feats = ${JSON.stringify(feats).replace(/</g, '\\u003c')};
    feats.forEach(function(f) {
      if (!f || !f.geometry) return;
      var layer = L.geoJSON(f.geometry, {
        style: { color: '#0e7490', weight: 3, fillOpacity: 0.25 },
        pointToLayer: function(feat, latlng) {
          return L.circleMarker(latlng, { radius: 6, color: '#0b3b60', fillColor: '#146c43', fillOpacity: 0.9, weight: 2 });
        }
      }).addTo(map).bindTooltip((f.label || '').slice(0, 22), { permanent: true, direction: 'top', offset: [0, -6], className: 'cnr-map-label' });
      try {
        var b = layer.getBounds();
        if (b && b.isValid()) { bounds.push(b.getSouthWest()); bounds.push(b.getNorthEast()); }
      } catch(e) {}
    });

    var initDraft = ${JSON.stringify(draftLatLngs)};
    window.updateDraft(initDraft, ${JSON.stringify(draftKind)});
    initDraft.forEach(function(pt) { bounds.push(pt); });

    var hasFocus = ${focusCoords ? 'true' : 'false'};
    if (!hasFocus && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [25, 25], maxZoom: 16 });
    }

    map.on('click', function(e) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ lat: e.latlng.lat, lng: e.latlng.lng }));
      }
    });
  </script>
</body>
</html>`;
  }, [geoFeatures, centerLat, centerLng]);

  useEffect(() => {
    webViewRef.current?.injectJavaScript(
      `window.updateDraft && window.updateDraft(${JSON.stringify(draftLatLngs)}, ${JSON.stringify(draftKind)}); true;`,
    );
  }, [draftLatLngs, draftKind]);

  useEffect(() => {
    webViewRef.current?.injectJavaScript(
      `window.updateUserPos && window.updateUserPos(${typeof userLat === 'number' ? userLat : 'null'}, ${typeof userLng === 'number' ? userLng : 'null'}); true;`,
    );
  }, [userLat, userLng]);

  useEffect(() => {
    if (focusCoords) {
      webViewRef.current?.injectJavaScript(
        `window.focusMap && window.focusMap(${focusCoords.lat}, ${focusCoords.lng}, ${focusCoords.zoom ?? 16}); true;`,
      );
    }
  }, [focusCoords]);

  return (
    <View style={{ height, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border }}>
      <WebView
        ref={webViewRef}
        source={{ html }}
        style={{ flex: 1 }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        nestedScrollEnabled
        onLoadEnd={() => {
          webViewRef.current?.injectJavaScript(
            `window.updateDraft && window.updateDraft(${JSON.stringify(draftLatLngs)}, ${JSON.stringify(draftKind)}); true;`,
          );
        }}
        onMessage={(ev) => {
          if (!onTapCoordinate) return;
          try {
            const msg = JSON.parse(ev.nativeEvent.data);
            if (typeof msg.lat === 'number' && typeof msg.lng === 'number') {
              onTapCoordinate(msg.lng, msg.lat);
            }
          } catch {
            // ignore
          }
        }}
      />
    </View>
  );
}
