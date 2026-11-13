import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, FlatList } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { COLORS } from '../theme';

interface MobileMapViewProps {
  activities: any[];
  geoFeatures: any[];
  onSelectActivity: (activity: any) => void;
}

export function MobileMapView({ activities, geoFeatures, onSelectActivity }: MobileMapViewProps) {
  const [mode, setMode] = useState<'map' | 'list'>('map');
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch {
        // ignore if GPS unavailable
      }
    })();
  }, []);

  const html = useMemo(() => {
    const actMarkers = activities
      .filter((a) => typeof a.lat === 'number' && typeof a.lng === 'number')
      .map((a) => ({
        id: a.id,
        folio: a.folio,
        title: a.title,
        status: a.status,
        lat: a.lat,
        lng: a.lng,
      }));

    const features = geoFeatures
      .map((g) => {
        try {
          return {
            id: g.id,
            kind: g.kind,
            label: g.label,
            geometry: JSON.parse(g.geometry),
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);

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
      font-size: 11px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 6px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.18);
      white-space: nowrap;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map').setView([${userPos?.lat ?? -33.4489}, ${userPos?.lng ?? -70.6693}], ${userPos ? 13 : 6});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(map);

    var uLat = ${userPos ? userPos.lat : 'null'};
    var uLng = ${userPos ? userPos.lng : 'null'};
    if (uLat !== null && uLng !== null) {
      L.circle([uLat, uLng], { radius: 60, color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.15, weight: 1 }).addTo(map);
      L.circleMarker([uLat, uLng], { radius: 7, color: '#ffffff', fillColor: '#2563eb', fillOpacity: 1, weight: 2.5 })
        .addTo(map)
        .bindTooltip('Mi ubicación', { permanent: true, direction: 'top', offset: [0, -8], className: 'cnr-map-label' });
    }

    function esc(s) {
      return String(s || '').replace(/[&<>"']/g, function(c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    var bounds = [];
    var acts = ${JSON.stringify(actMarkers)};
    acts.forEach(function(a) {
      bounds.push([a.lat, a.lng]);
      L.circleMarker([a.lat, a.lng], {
        radius: 8,
        color: '#0b3b60',
        fillColor: '#146c43',
        fillOpacity: 0.9,
        weight: 2
      })
        .addTo(map)
        .bindPopup('<b>' + esc(a.folio) + '</b><br/>' + esc(a.title) + '<br/><small>' + esc(a.status) + '</small>')
        .bindTooltip(a.folio, { permanent: true, direction: 'top', offset: [0, -8], className: 'cnr-map-label' });
    });

    var feats = ${JSON.stringify(features)};
    feats.forEach(function(f) {
      if (!f || !f.geometry) return;
      var refTxt = (f.label || f.kind || '').slice(0, 24);
      var layer = L.geoJSON(f.geometry, {
        style: { color: '#0e7490', weight: 3, fillOpacity: 0.25 },
        pointToLayer: function(feat, latlng) {
          return L.circleMarker(latlng, { radius: 6, color: '#0e7490', fillColor: '#38bdf8', fillOpacity: 0.9 });
        }
      })
        .addTo(map)
        .bindPopup('<b>' + esc(f.kind) + '</b>: ' + esc(f.label))
        .bindTooltip(refTxt, { permanent: true, direction: 'top', offset: [0, -6], className: 'cnr-map-label' });
      try {
        var b = layer.getBounds();
        if (b && b.isValid()) { bounds.push(b.getSouthWest()); bounds.push(b.getNorthEast()); }
      } catch(e) {}
    });

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    }
  </script>
</body>
</html>`;
  }, [activities, geoFeatures, userPos]);

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.subBar}>
        <TouchableOpacity onPress={() => setMode('map')} style={[styles.subBtn, mode === 'map' && styles.subBtnActive]}>
          <Text style={[styles.subTxt, mode === 'map' && styles.subTxtActive]}>🗺️ Mapa Interactivo</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setMode('list')} style={[styles.subBtn, mode === 'list' && styles.subBtnActive]}>
          <Text style={[styles.subTxt, mode === 'list' && styles.subTxtActive]}>📍 Geometrías ({geoFeatures.length})</Text>
        </TouchableOpacity>
      </View>

      {mode === 'map' ? (
        <WebView source={{ html }} style={{ flex: 1 }} originWhitelist={['*']} javaScriptEnabled domStorageEnabled />
      ) : (
        <FlatList
          data={geoFeatures}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 14, gap: 10 }}
          ListEmptyComponent={<Text style={styles.empty}>Sin geometrías GPS capturadas localmente.</Text>}
          renderItem={({ item }) => {
            const geom = JSON.parse(item.geometry);
            const firstPt =
              geom.type === 'Point'
                ? geom.coordinates
                : geom.type === 'Polygon'
                  ? geom.coordinates[0][0]
                  : geom.coordinates[0];
            const act = activities.find((a) => a.id === item.activityId);
            return (
              <View style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.folio}>{item.kind} · {item.label}</Text>
                  <Text style={styles.meta}>{item.synced ? '✓ Sync' : '⏳ Local'}</Text>
                </View>
                <Text style={styles.meta}>
                  Lat: {firstPt[1].toFixed(5)} · Lng: {firstPt[0].toFixed(5)} {item.accuracy ? `· ±${Math.round(item.accuracy)} m` : ''}
                </Text>
                {item.observations ? <Text style={styles.meta}>{item.observations}</Text> : null}
                <View style={{ flexDirection: 'row', gap: 14, marginTop: 8 }}>
                  <TouchableOpacity
                    onPress={() => Linking.openURL(`https://www.openstreetmap.org/?mlat=${firstPt[1]}&mlon=${firstPt[0]}#map=16/${firstPt[1]}/${firstPt[0]}`)}
                  >
                    <Text style={{ color: COLORS.water, fontWeight: '700', fontSize: 12 }}>Abrir en OSM →</Text>
                  </TouchableOpacity>
                  {act && (
                    <TouchableOpacity onPress={() => onSelectActivity(act)}>
                      <Text style={{ color: COLORS.green, fontWeight: '700', fontSize: 12 }}>Ver {act.folio} →</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  subBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  subBtn: { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center', backgroundColor: '#e8efec' },
  subBtnActive: { backgroundColor: COLORS.primary },
  subTxt: { fontSize: 12, fontWeight: '700', color: COLORS.text },
  subTxtActive: { color: '#fff' },
  card: { backgroundColor: COLORS.surface, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  folio: { fontWeight: '800', color: COLORS.water, fontSize: 13 },
  meta: { fontSize: 12, color: COLORS.muted, marginTop: 3 },
  empty: { textAlign: 'center', color: COLORS.muted, marginTop: 40 },
});
