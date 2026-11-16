import React from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, getStatusStyle } from '../theme';

interface MobileDashboardProps {
  activities: any[];
  geoCount: number;
  pendingCount: number;
  onSelectActivity: (a: any) => void;
  onNewActivity: () => void;
  onGoKanban: () => void;
}

const STATUS_ORDER = ['PENDIENTE', 'ASIGNADA', 'EN_EJECUCION', 'EN_REVISION', 'CERRADA'];

export function MobileDashboard({
  activities,
  geoCount,
  pendingCount,
  onSelectActivity,
  onNewActivity,
  onGoKanban,
}: MobileDashboardProps) {
  const total = activities.length;
  const inExec = activities.filter((a) => a.status === 'EN_EJECUCION').length;
  const closed = activities.filter((a) => a.status === 'CERRADA').length;
  const critical = activities.filter((a) => a.priority === 'CRITICA').length;
  const avgProgress = total > 0 ? Math.round(activities.reduce((s, a) => s + (Number(a.progress) || 0), 0) / total) : 0;

  return (
    <ScrollView contentContainerStyle={{ padding: 14, gap: 14, paddingBottom: 28 }}>
      {/* Hero Banner */}
      <View style={styles.heroCard}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={styles.heroEyebrow}>MINISTERIO DE AGRICULTURA · CNR</Text>
            <Text style={styles.heroTitle}>Resumen Operacional</Text>
          </View>
          <TouchableOpacity onPress={onNewActivity} style={styles.heroBtn}>
            <Text style={styles.heroBtnTxt}>+ Nueva OT</Text>
          </TouchableOpacity>
        </View>
        <View style={{ marginTop: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ color: '#d1fae5', fontSize: 11, fontWeight: '600' }}>Avance promedio global</Text>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>{avgProgress}%</Text>
          </View>
          <View style={{ height: 7, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 999, overflow: 'hidden' }}>
            <View style={{ height: 7, width: `${avgProgress}%`, backgroundColor: '#34d399', borderRadius: 999 }} />
          </View>
        </View>
      </View>

      {/* KPIs 2x2 */}
      <View style={styles.kpiGrid}>
        <View style={[styles.kpiCard, { borderTopColor: COLORS.primary }]}>
          <Text style={styles.kpiLabel}>Total OTs</Text>
          <Text style={[styles.kpiVal, { color: COLORS.primary }]}>{total}</Text>
        </View>
        <View style={[styles.kpiCard, { borderTopColor: COLORS.amber }]}>
          <Text style={styles.kpiLabel}>En Ejecución</Text>
          <Text style={[styles.kpiVal, { color: COLORS.amber }]}>{inExec}</Text>
        </View>
        <View style={[styles.kpiCard, { borderTopColor: COLORS.green }]}>
          <Text style={styles.kpiLabel}>Cerradas</Text>
          <Text style={[styles.kpiVal, { color: COLORS.green }]}>{closed}</Text>
        </View>
        <View style={[styles.kpiCard, { borderTopColor: COLORS.danger }]}>
          <Text style={styles.kpiLabel}>Críticas</Text>
          <Text style={[styles.kpiVal, { color: COLORS.danger }]}>{critical}</Text>
        </View>
      </View>

      {/* Distribución por Estado */}
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <Text style={styles.sectionTitle}>Avance por Estado</Text>
          <TouchableOpacity onPress={onGoKanban}>
            <Text style={{ color: COLORS.water, fontSize: 12, fontWeight: '700' }}>Ver Kanban →</Text>
          </TouchableOpacity>
        </View>
        {STATUS_ORDER.map((st) => {
          const count = activities.filter((a) => a.status === st).length;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const stStyle = getStatusStyle(st);
          return (
            <View key={st} style={{ marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: stStyle.fg }}>{st}</Text>
                <Text style={{ fontSize: 11, color: COLORS.muted }}>{count} ({pct}%)</Text>
              </View>
              <View style={{ height: 6, backgroundColor: '#e8efec', borderRadius: 999, overflow: 'hidden' }}>
                <View style={{ height: 6, width: `${pct}%`, backgroundColor: stStyle.border, borderRadius: 999 }} />
              </View>
            </View>
          );
        })}
        <Text style={{ fontSize: 11, color: COLORS.muted, marginTop: 4 }}>
          🗺️ {geoCount} geometrías GPS · 🔄 {pendingCount} cambios pendientes de sync
        </Text>
      </View>

      {/* Últimas Actividades */}
      <View style={styles.card}>
        <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>Actividades Recientes</Text>
        {activities.slice(0, 5).map((a) => {
          const st = getStatusStyle(a.status);
          return (
            <TouchableOpacity key={a.id} onPress={() => onSelectActivity(a)} style={styles.recentItem}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.water }}>{a.folio}</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text }} numberOfLines={1}>
                  {a.title}
                </Text>
              </View>
              <Text style={[styles.badge, { backgroundColor: st.bg, color: st.fg }]}>{a.status}</Text>
            </TouchableOpacity>
          );
        })}
        {activities.length === 0 && <Text style={{ fontSize: 12, color: COLORS.muted }}>Sin actividades locales. Presione Sync.</Text>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  heroCard: { backgroundColor: COLORS.primary, borderRadius: 14, padding: 16 },
  heroEyebrow: { fontSize: 10, fontWeight: '700', color: '#a7f3d0', letterSpacing: 0.6 },
  heroTitle: { fontSize: 18, fontWeight: '800', color: '#fff', marginTop: 2 },
  heroBtn: { backgroundColor: COLORS.green, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 4 },
  heroBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpiCard: { width: '48%', backgroundColor: COLORS.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: COLORS.border, borderTopWidth: 4 },
  kpiLabel: { fontSize: 11, fontWeight: '700', color: COLORS.muted, textTransform: 'uppercase' },
  kpiVal: { fontSize: 26, fontWeight: '800', marginTop: 4 },
  card: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.border },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: COLORS.primary },
  recentItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#eef3f1', gap: 8 },
  badge: { fontSize: 10, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
});
