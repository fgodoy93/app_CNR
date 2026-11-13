import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';

export function NewActivityModal({
  visible,
  types,
  onCreate,
  onClose,
}: {
  visible: boolean;
  types: { id: string; name: string; prefix: string }[];
  onCreate: (input: { typeId: string; title: string; description: string; priority: 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA'; address: string }) => void;
  onClose: () => void;
}) {
  const [typeId, setTypeId] = useState(types[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA'>('MEDIA');
  const [address, setAddress] = useState('');

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

          <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Título de la inspección u orden *" />
          <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="Ubicación / Sector" />
          <TextInput style={[styles.input, { height: 60 }]} multiline value={description} onChangeText={setDescription} placeholder="Descripción" />

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
                if (!chosenType || !title.trim()) return;
                onCreate({ typeId: chosenType, title: title.trim(), description: description.trim(), priority, address: address.trim() });
                setTitle('');
                setDescription('');
                setAddress('');
              }}
              style={styles.btnPri}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>Crear</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 10 },
  title: { fontSize: 16, fontWeight: '800', color: '#0f4c81' },
  label: { fontSize: 12, fontWeight: '700', color: '#475569' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1' },
  chipActive: { backgroundColor: '#0f4c81', borderColor: '#0f4c81' },
  chipTxt: { fontSize: 11, color: '#334155', fontWeight: '600' },
  chipTxtActive: { color: '#fff' },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 10, fontSize: 13 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 6 },
  btnSec: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, backgroundColor: '#e2e8f0' },
  btnPri: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, backgroundColor: '#0f4c81' },
});
