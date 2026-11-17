import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import * as Location from 'expo-location';
import { AddressAutocompleteMobile } from './AddressAutocompleteMobile';
import { COLORS } from '../theme';

export function NewActivityModal({
  visible,
  types,
  onCreate,
  onClose,
}: {
  visible: boolean;
  types: { id: string; name: string; prefix: string }[];
  onCreate: (input: {
    typeId: string;
    title: string;
    description: string;
    priority: 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';
    address: string;
    lat?: number;
    lng?: number;
  }) => void;
  onClose: () => void;
}) {
  const [typeId, setTypeId] = useState(types[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA'>('MEDIA');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  const useCurrentLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        return Alert.alert('Permiso requerido', 'Autorice el acceso al GPS para usar su ubicación.');
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: lat, longitude: lng } = pos.coords;
      setCoords({ lat, lng });
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
          { headers: { 'User-Agent': 'TerrenoCNR-App/1.0' } },
        );
        const data = (await res.json()) as { display_name?: string };
        setAddress(
          data.display_name
            ? data.display_name.split(',').slice(0, 3).join(',').trim()
            : `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        );
      } catch {
        setAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      }
    } catch {
      Alert.alert('GPS no disponible', 'No se pudo obtener la ubicación actual.');
    } finally {
      setLocating(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Nueva Actividad / OT (Offline)</Text>

          <Text style={styles.label}>Proceso Institucional</Text>
          <View style={styles.row}>
            {types.map((t) => {
              const active = (typeId || types[0]?.id) === t.id;
              return (
                <TouchableOpacity key={t.id} onPress={() => setTypeId(t.id)} style={[styles.chip, active && styles.chipActive]}>
                  <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>{t.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Título de la inspección u orden *" placeholderTextColor="#64748b" />
          <AddressAutocompleteMobile
            value={address}
            onChangeText={setAddress}
            onSelect={(item) => setCoords({ lat: item.lat, lng: item.lng })}
            placeholder="Ubicación / Sector (con sugerencias)"
          />
          <TouchableOpacity onPress={useCurrentLocation} disabled={locating} style={styles.gpsBtn}>
            <Text style={styles.gpsBtnTxt}>{locating ? 'Obteniendo GPS...' : '📍 Usar mi ubicación actual'}</Text>
          </TouchableOpacity>
          <TextInput style={[styles.input, { height: 60 }]} multiline value={description} onChangeText={setDescription} placeholder="Descripción" placeholderTextColor="#64748b" />

          <Text style={styles.label}>Prioridad</Text>
          <View style={styles.row}>
            {(['BAJA', 'MEDIA', 'ALTA', 'CRITICA'] as const).map((p) => (
              <TouchableOpacity key={p} onPress={() => setPriority(p)} style={[styles.chip, priority === p && styles.chipActive]}>
                <Text style={[styles.chipTxt, priority === p && styles.chipTxtActive]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity onPress={onClose} style={styles.btnSec}>
              <Text>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                const chosenType = typeId || types[0]?.id;
                if (!chosenType) {
                  Alert.alert('Sin procesos', 'Sincronice primero en la pestaña Sync para descargar los tipos de proceso.');
                  return;
                }
                if (!title.trim()) {
                  Alert.alert('Campo requerido', 'Ingrese un título para la inspección u orden.');
                  return;
                }
                onCreate({
                  typeId: chosenType,
                  title: title.trim(),
                  description: description.trim(),
                  priority,
                  address: address.trim(),
                  lat: coords?.lat,
                  lng: coords?.lng,
                });
                setTitle('');
                setDescription('');
                setAddress('');
                setCoords(null);
              }}
              style={styles.btnPri}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>Guardar OT</Text>
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
  label: { fontSize: 12, fontWeight: '700', color: COLORS.muted },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipTxt: { fontSize: 11, color: COLORS.text, fontWeight: '600' },
  chipTxtActive: { color: '#fff' },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 10, fontSize: 13, color: COLORS.text },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 6 },
  btnSec: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 4, backgroundColor: '#e2ebe7' },
  btnPri: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 4, backgroundColor: COLORS.primary },
  gpsBtn: { alignSelf: 'flex-start', backgroundColor: COLORS.waterSoft, borderWidth: 1, borderColor: COLORS.primary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4 },
  gpsBtnTxt: { color: '#0369a1', fontSize: 12, fontWeight: '700' },
});
