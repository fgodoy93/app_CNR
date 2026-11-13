import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import * as Location from 'expo-location';
import { closeRing, type Position } from '@terreno/shared';
import { COLORS } from '../theme';

export type GeoKindChoice = 'POINT' | 'LINE' | 'TRACK' | 'POLYGON';

export function GeoCaptureModal({
  visible,
  onSave,
  onClose,
}: {
  visible: boolean;
  onSave: (input: {
    kind: GeoKindChoice;
    geometry: { type: 'Point'; coordinates: Position } | { type: 'LineString'; coordinates: Position[] } | { type: 'Polygon'; coordinates: Position[][] };
    label: string;
    status: string;
    observations: string;
    accuracy: number | null;
  }) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<GeoKindChoice>('POINT');
  const [label, setLabel] = useState('');
  const [status, setStatus] = useState('Conforme');
  const [observations, setObservations] = useState('');
  const [points, setPoints] = useState<Position[]>([]);
  const [lastAcc, setLastAcc] = useState<number | null>(null);
  const [capturing, setCapturing] = useState(false);

  if (!visible) return null;

  const captureVertex = async () => {
    setCapturing(true);
    try {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== 'granted') {
        Alert.alert('Permiso GPS requerido', 'Habilite el acceso a la ubicación.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const pt: Position = [pos.coords.longitude, pos.coords.latitude];
      setPoints((prev) => (kind === 'POINT' ? [pt] : [...prev, pt]));
      setLastAcc(pos.coords.accuracy ?? null);
    } catch (e: any) {
      Alert.alert('Error GPS', e.message);
    } finally {
      setCapturing(false);
    }
  };

  const handleSave = () => {
    if (kind === 'POINT' && points.length < 1) return Alert.alert('Falta punto', 'Capture al menos 1 coordenada GPS.');
    if ((kind === 'LINE' || kind === 'TRACK') && points.length < 2) {
      return Alert.alert('Faltan vértices', 'Una línea o recorrido requiere al menos 2 puntos.');
    }
    if (kind === 'POLYGON' && points.length < 3) {
      return Alert.alert('Faltan vértices', 'Un polígono requiere al menos 3 vértices.');
    }

    const geometry =
      kind === 'POINT'
        ? { type: 'Point' as const, coordinates: points[0]! }
        : kind === 'POLYGON'
          ? { type: 'Polygon' as const, coordinates: [closeRing(points)] }
          : { type: 'LineString' as const, coordinates: points };

    onSave({
      kind,
      geometry,
      label: label.trim() || `${kind} Terreno`,
      status,
      observations: observations.trim(),
      accuracy: lastAcc,
    });
    setPoints([]);
    setLabel('');
    setObservations('');
    setLastAcc(null);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Captura Georreferenciada GPS</Text>

          <View style={styles.kindRow}>
            {(['POINT', 'LINE', 'TRACK', 'POLYGON'] as GeoKindChoice[]).map((k) => (
              <TouchableOpacity
                key={k}
                onPress={() => {
                  setKind(k);
                  setPoints([]);
                }}
                style={[styles.kindBtn, kind === k && styles.kindBtnActive]}
              >
                <Text style={[styles.kindTxt, kind === k && styles.kindTxtActive]}>
                  {k === 'POINT' ? 'Punto' : k === 'LINE' ? 'Línea' : k === 'TRACK' ? 'Recorrido' : 'Polígono'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput style={styles.input} value={label} onChangeText={setLabel} placeholder="Nombre / Identificador del punto" />
          <View style={styles.kindRow}>
            {['Conforme', 'Observado', 'Crítico'].map((st) => (
              <TouchableOpacity key={st} onPress={() => setStatus(st)} style={[styles.kindBtn, status === st && styles.kindBtnActive]}>
                <Text style={[styles.kindTxt, status === st && styles.kindTxtActive]}>{st}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={[styles.input, { height: 60, textAlignVertical: 'top' }]}
            multiline
            value={observations}
            onChangeText={setObservations}
            placeholder="Observaciones del punto o tramo..."
          />

          <TouchableOpacity onPress={captureVertex} disabled={capturing} style={styles.gpsBtn}>
            <Text style={styles.gpsTxt}>
              {capturing ? 'Obteniendo señal GPS...' : kind === 'POINT' ? '📍 Capturar Coordenada GPS' : `📍 Agregar Vértice (${points.length})`}
            </Text>
          </TouchableOpacity>

          {points.length > 0 && (
            <View style={{ gap: 6 }}>
              <Text style={styles.info}>
                Vértices capturados: {points.length} · Último: {points[points.length - 1]![1].toFixed(5)}, {points[points.length - 1]![0].toFixed(5)}
                {lastAcc !== null ? ` (±${Math.round(lastAcc)} m)` : ''}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={() => setPoints((p) => p.slice(0, -1))} style={styles.btnSec}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.text }}>Deshacer último</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setPoints([])} style={[styles.btnSec, { backgroundColor: COLORS.dangerSoft }]}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.danger }}>Limpiar puntos</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={styles.actions}>
            <TouchableOpacity onPress={onClose} style={styles.btnSec}>
              <Text>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} style={styles.btnPri}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Guardar Geometría</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(11,59,96,0.55)', justifyContent: 'center', padding: 16 },
  card: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, borderColor: COLORS.border },
  title: { fontSize: 16, fontWeight: '800', color: COLORS.primary },
  kindRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  kindBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border },
  kindBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  kindTxt: { fontSize: 12, color: COLORS.text, fontWeight: '600' },
  kindTxtActive: { color: '#fff' },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 10, fontSize: 13, color: COLORS.text },
  gpsBtn: { backgroundColor: COLORS.water, padding: 12, borderRadius: 10, alignItems: 'center' },
  gpsTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  info: { fontSize: 12, color: COLORS.green, fontWeight: '600' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 6 },
  btnSec: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: '#e2ebe7' },
  btnPri: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: COLORS.green },
});
