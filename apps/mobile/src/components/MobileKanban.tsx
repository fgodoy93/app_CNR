import React from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, getStatusStyle } from '../theme';

const COLUMNS = [
  { key: 'PENDIENTE', label: 'Pendiente' },
  { key: 'ASIGNADA', label: 'Asignada' },
  { key: 'EN_EJECUCION', label: 'En Ejecución' },
  { key: 'EN_REVISION', label: 'En Revisión' },
  { key: 'CERRADA', label: 'Cerrada' },
];

export function MobileKanban({
  activities,
  onSelectActivity,
}: {
  activities: any[];
  onSelectActivity: (a: any) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 12, gap: 12 }}>
      {COLUMNS.map((col) => {
        const stStyle = getStatusStyle(col.key);
        const items = activities.filter(
          (a) => a.status === col.key || (col.key === 'EN_REVISION' && a.status === 'EN_APROBACION'),
        );
        return (
          <View key={col.key} style={[styles.col, { borderTopColor: stStyle.border }]}>
            <View style={styles.colHeader}>
              <Text style={[styles.colBadge, { backgroundColor: stStyle.bg, color: stStyle.fg }]}>{col.label}</Text>
              <Text style={styles.colCount}>{items.length}</Text>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 16 }}>
              {items.length === 0 ? (
                <Text style={styles.emptyCol}>Sin actividades</Text>
              ) : (
                items.map((a) => (
                  <TouchableOpacity key={a.id} onPress={() => onSelectActivity(a)} style={styles.card}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={styles.folio}>{a.folio}</Text>
                      <Text style={styles.prio}>{a.priority}</Text>
                    </View>
                    <Text style={styles.title} numberOfLines={2}>{a.title}</Text>
                    <Text style={styles.meta} numberOfLines={1}>{a.typeName}</Text>
                    <View style={styles.track}>
                      <View style={[styles.fill, { width: `${Math.min(100, Number(a.progress) || 0)}%` }]} />
                    </View>
                    <Text style={styles.pct}>{a.progress ?? 0}%</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  col: { width: 255, backgroundColor: '#e9f0ed', borderRadius: 12, padding: 10, borderTopWidth: 4, borderWidth: 1, borderColor: COLORS.border, maxHeight: '100%' },
  colHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  colBadge: { fontSize: 11, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  colCount: { fontSize: 12, fontWeight: '800', color: COLORS.muted },
  emptyCol: { fontSize: 12, color: COLORS.muted, textAlign: 'center', paddingVertical: 20 },
  card: { backgroundColor: COLORS.surface, borderRadius: 10, padding: 11, borderWidth: 1, borderColor: COLORS.border },
  folio: { fontSize: 11, fontWeight: '800', color: COLORS.water },
  prio: { fontSize: 10, fontWeight: '700', color: COLORS.muted },
  title: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginTop: 3 },
  meta: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  track: { height: 5, backgroundColor: '#e2ebe7', borderRadius: 999, marginTop: 8, overflow: 'hidden' },
  fill: { height: 5, backgroundColor: COLORS.green, borderRadius: 999 },
  pct: { fontSize: 10, fontWeight: '700', color: COLORS.green, textAlign: 'right', marginTop: 2 },
});
