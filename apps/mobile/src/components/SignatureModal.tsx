import React, { useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, PanResponder, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';

export function SignatureModal({
  visible,
  onSave,
  onClose,
}: {
  visible: boolean;
  onSave: (svgData: string) => void;
  onClose: () => void;
}) {
  const [paths, setPaths] = useState<string[]>([]);
  const currentPath = useRef('');

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        currentPath.current = `M${locationX.toFixed(1)},${locationY.toFixed(1)}`;
        setPaths((prev) => [...prev, currentPath.current]);
      },
      onPanResponderMove: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        currentPath.current += ` L${locationX.toFixed(1)},${locationY.toFixed(1)}`;
        setPaths((prev) => [...prev.slice(0, -1), currentPath.current]);
      },
    }),
  ).current;

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Firma Digital Simple</Text>
          <View style={styles.pad} {...panResponder.panHandlers}>
            <Svg style={StyleSheet.absoluteFill}>
              {paths.map((d, i) => (
                <Path key={i} d={d} stroke="#0f172a" strokeWidth={3} fill="none" strokeLinecap="round" />
              ))}
            </Svg>
          </View>
          <View style={styles.actions}>
            <TouchableOpacity onPress={() => setPaths([])} style={styles.btnSec}>
              <Text>Limpiar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={styles.btnSec}>
              <Text>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                onSave(JSON.stringify(paths));
                setPaths([]);
              }}
              style={styles.btnPri}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>Guardar Firma</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 12, color: '#0f172a' },
  pad: { height: 220, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, backgroundColor: '#f8fafc' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 },
  btnSec: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, backgroundColor: '#e2e8f0' },
  btnPri: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, backgroundColor: '#0f4c81' },
});
