import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Crypto from 'expo-crypto';
import {
  DEFAULT_WORKFLOW,
  availableTransitions,
  type FormDefinition,
  type WorkflowDefinition,
  type WorkflowTransition,
} from '@terreno/shared';
import { getDb } from './src/db/sqlite';
import { apiFetch, clearSession, getApiUrl, getStoredUser, getToken, setApiUrl, setSession } from './src/api/client';
import { enqueueMutation, syncAll } from './src/sync/syncEngine';
import { DynamicFormMobile, type CapturedEvidence } from './src/components/DynamicFormMobile';
import { GeoCaptureModal, type GeoKindChoice } from './src/components/GeoCaptureModal';
import { NewActivityModal } from './src/components/NewActivityModal';

type Tab = 'activities' | 'map' | 'sync';

export default function App() {
  const [ready, setReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [user, setUser] = useState<{ id: string; name: string; email: string; role: string; permissions: string[] } | null>(null);
  const [apiUrlInput, setApiUrlInput] = useState('http://192.168.1.158:4000');
  const [email, setEmail] = useState('terreno@cnr.gob.cl');
  const [password, setPassword] = useState('Cnr2026!Demo');

  const [tab, setTab] = useState<Tab>('activities');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [activities, setActivities] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [allGeo, setAllGeo] = useState<any[]>([]);
  const [queueItems, setQueueItems] = useState<any[]>([]);
  const [pendingEvCount, setPendingEvCount] = useState(0);

  const [selected, setSelected] = useState<any | null>(null);
  const [formDef, setFormDef] = useState<FormDefinition | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [transitions, setTransitions] = useState<WorkflowTransition[]>([]);
  const [transitionComment, setTransitionComment] = useState('');
  const [actGeo, setActGeo] = useState<any[]>([]);
  const [actEvidences, setActEvidences] = useState<any[]>([]);

  const [showGeoModal, setShowGeoModal] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const refreshLocal = async () => {
    const db = await getDb();
    setActivities(await db.getAllAsync<any>(`SELECT * FROM activities ORDER BY updatedAt DESC`));
    setTypes(await db.getAllAsync<any>(`SELECT * FROM activity_types ORDER BY name ASC`));
    setAllGeo(await db.getAllAsync<any>(`SELECT * FROM geo_features ORDER BY capturedAt DESC`));
    setQueueItems(await db.getAllAsync<any>(`SELECT * FROM sync_queue ORDER BY clientTime DESC`));
    const ev = await db.getFirstAsync<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM evidences WHERE synced = 0`);
    setPendingEvCount(ev?.cnt ?? 0);
  };

  useEffect(() => {
    (async () => {
      setApiUrlInput(await getApiUrl());
      const tok = await getToken();
      if (tok) {
        setLoggedIn(true);
        setUser(await getStoredUser());
        await refreshLocal();
      }
      setReady(true);
    })();
  }, []);

  const handleLogin = async () => {
    try {
      await setApiUrl(apiUrlInput);
      const res = await apiFetch<{ accessToken: string; user: any }>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, device: 'mobile-app' }),
      });
      await setSession(res.accessToken, res.user);
      setUser(res.user);
      setLoggedIn(true);
      await handleSync();
    } catch (e: any) {
      Alert.alert('Error de acceso', e.message);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const summary = await syncAll();
      await refreshLocal();
      Alert.alert(
        'Sincronización Completa',
        `Actividades: ${summary.pulledActivities}\nMutaciones enviadas: ${summary.pushedMutations}\nEvidencias subidas: ${summary.uploadedEvidences}`,
      );
    } catch (e: any) {
      await refreshLocal();
      Alert.alert('Modo Sin Conexión (Offline)', `Los datos locales se mantienen seguros. (${e.message})`);
    } finally {
      setSyncing(false);
    }
  };

  const openActivity = async (act: any) => {
    const db = await getDb();
    setSelected(act);
    setFormData(JSON.parse(act.data || '{}'));

    if (act.formVersionId) {
      const fv = await db.getFirstAsync<{ definition: string }>(`SELECT definition FROM form_versions WHERE id = ?`, [act.formVersionId]);
      setFormDef(fv ? JSON.parse(fv.definition) : null);
    } else {
      setFormDef(null);
    }

    // Load workflow transitions available for this user
    let wfDef: WorkflowDefinition = DEFAULT_WORKFLOW;
    const tRow = await db.getFirstAsync<{ workflowId: string | null }>(`SELECT workflowId FROM activity_types WHERE id = ?`, [act.typeId]);
    if (tRow?.workflowId) {
      const wfRow = await db.getFirstAsync<{ definition: string }>(`SELECT definition FROM workflows WHERE id = ?`, [tRow.workflowId]);
      if (wfRow) wfDef = JSON.parse(wfRow.definition);
    }
    const curUser = user ?? (await getStoredUser());
    setTransitions(
      availableTransitions(
        wfDef,
        { status: act.status, assigneeId: curUser?.id ?? null },
        { userId: curUser?.id ?? null, roleKey: curUser?.role ?? 'terreno', permissions: curUser?.permissions ?? [] },
      ),
    );

    setActGeo(await db.getAllAsync<any>(`SELECT * FROM geo_features WHERE activityId = ? ORDER BY capturedAt DESC`, [act.id]));
    setActEvidences(await db.getAllAsync<any>(`SELECT * FROM evidences WHERE activityId = ? ORDER BY capturedAt DESC`, [act.id]));
  };

  const saveOfflineProgress = async () => {
    if (!selected) return;
    const db = await getDb();
    const now = new Date().toISOString();
    await db.runAsync(`UPDATE activities SET data = ?, updatedAt = ? WHERE id = ?`, [JSON.stringify(formData), now, selected.id]);
    await enqueueMutation('activity', 'upsert', selected.id, { data: formData, baseVersion: selected.version });
    await refreshLocal();
    Alert.alert('Guardado Offline', 'Formulario guardado en SQLite local y encolado para sincronizar.');
  };

  const executeWorkflowTransition = async (tr: WorkflowTransition) => {
    if (!selected) return;
    if (tr.requireComment && !transitionComment.trim()) {
      return Alert.alert('Comentario requerido', 'Ingrese una observación para ejecutar esta transición.');
    }
    const db = await getDb();
    const now = new Date().toISOString();
    await db.runAsync(`UPDATE activities SET status = ?, updatedAt = ? WHERE id = ?`, [tr.to, now, selected.id]);
    await enqueueMutation('transition', 'execute', selected.id, {
      activityId: selected.id,
      transition: tr.key,
      comment: transitionComment.trim() || undefined,
    });
    setTransitionComment('');
    const updated = { ...selected, status: tr.to, updatedAt: now };
    await refreshLocal();
    await openActivity(updated);
    Alert.alert('Estado Actualizado', `La actividad pasó a ${tr.to} (encolado para sincronizar).`);
  };

  const handleCaptureEvidence = async (ev: CapturedEvidence) => {
    if (!selected) return;
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO evidences (id, activityId, kind, fieldKey, fileUri, fileName, mimeType, note, source, lat, lng, accuracy, capturedAt, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        ev.id,
        selected.id,
        ev.kind,
        ev.fieldKey,
        ev.fileUri ?? null,
        ev.fileName ?? null,
        ev.mimeType ?? null,
        ev.note ?? null,
        ev.source ?? 'mobile',
        ev.lat ?? null,
        ev.lng ?? null,
        ev.accuracy ?? null,
        new Date().toISOString(),
      ],
    );
    await refreshLocal();
    setActEvidences(await db.getAllAsync<any>(`SELECT * FROM evidences WHERE activityId = ? ORDER BY capturedAt DESC`, [selected.id]));
  };

  const saveGeoFeature = async (input: {
    kind: GeoKindChoice;
    geometry: any;
    label: string;
    status: string;
    observations: string;
    accuracy: number | null;
  }) => {
    if (!selected) return;
    const db = await getDb();
    const id = Crypto.randomUUID();
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO geo_features (id, activityId, kind, geometry, label, observations, accuracy, capturedAt, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [id, selected.id, input.kind, JSON.stringify(input.geometry), input.label, input.observations, input.accuracy, now],
    );
    await enqueueMutation('geoFeature', 'upsert', id, {
      activityId: selected.id,
      kind: input.kind,
      geometry: input.geometry,
      label: input.label,
      status: input.status,
      observations: input.observations,
      accuracy: input.accuracy ?? undefined,
      capturedAt: now,
    });
    setShowGeoModal(false);
    await refreshLocal();
    setActGeo(await db.getAllAsync<any>(`SELECT * FROM geo_features WHERE activityId = ? ORDER BY capturedAt DESC`, [selected.id]));
    Alert.alert('Geometría Guardada', `${input.kind} "${input.label}" guardado en SQLite.`);
  };

  const handleCreateActivity = async (input: {
    typeId: string;
    title: string;
    description: string;
    priority: 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';
    address: string;
  }) => {
    const db = await getDb();
    const id = Crypto.randomUUID();
    const now = new Date().toISOString();
    const t = types.find((x) => x.id === input.typeId);
    const folio = `LOCAL-${Math.floor(1000 + Math.random() * 9000)}`;
    let formVersionId: string | null = null;
    if (t?.formTemplateId) {
      const fv = await db.getFirstAsync<{ id: string }>(`SELECT id FROM form_versions WHERE templateId = ? ORDER BY version DESC LIMIT 1`, [
        t.formTemplateId,
      ]);
      formVersionId = fv?.id ?? null;
    }

    await db.runAsync(
      `INSERT INTO activities (id, folio, typeId, typeName, title, description, priority, status, progress, formVersionId, data, address, version, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', 0, ?, '{}', ?, 1, ?)`,
      [id, folio, input.typeId, t?.name ?? 'Actividad', input.title, input.description, input.priority, formVersionId, input.address, now],
    );
    await enqueueMutation('activity', 'upsert', id, {
      typeId: input.typeId,
      title: input.title,
      description: input.description || null,
      priority: input.priority,
      address: input.address || null,
    });
    setShowNewModal(false);
    await refreshLocal();
    Alert.alert('Actividad Creada Offline', `Folio temporal ${folio}. Presione Sincronizar cuando tenga conexión.`);
  };

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0f4c81" />
      </View>
    );
  }

  if (!loggedIn) {
    return (
      <SafeAreaView style={styles.loginContainer}>
        <StatusBar style="dark" />
        <View style={styles.loginCard}>
          <Text style={styles.brand}>TerrenoCNR Móvil</Text>
          <Text style={styles.sub}>Comisión Nacional de Riego · Android / iOS Offline</Text>
          <TextInput style={styles.input} value={apiUrlInput} onChangeText={setApiUrlInput} placeholder="URL API" autoCapitalize="none" />
          <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Correo" autoCapitalize="none" />
          <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Contraseña" secureTextEntry />
          <TouchableOpacity onPress={handleLogin} style={styles.primaryBtn}>
            <Text style={styles.primaryTxt}>Ingresar</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Activity Detail Screen
  if (selected) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setSelected(null)}>
            <Text style={styles.headerLink}>← Volver</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{selected.folio}</Text>
          <TouchableOpacity onPress={saveOfflineProgress}>
            <Text style={styles.headerLink}>Guardar</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 14, gap: 14 }}>
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.badge}>{selected.status}</Text>
              <Text style={styles.meta}>Prioridad: {selected.priority} · {selected.progress}%</Text>
            </View>
            <Text style={styles.cardTitle}>{selected.title}</Text>
            {selected.address ? <Text style={styles.meta}>📍 {selected.address}</Text> : null}
          </View>

          {/* Workflow Transitions */}
          {transitions.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.sectionHeader}>Flujo de Trabajo y Aprobación</Text>
              <TextInput
                style={[styles.input, { marginBottom: 8 }]}
                value={transitionComment}
                onChangeText={setTransitionComment}
                placeholder="Comentario / observación para cambio de estado..."
              />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {transitions.map((tr) => (
                  <TouchableOpacity key={tr.key} onPress={() => executeWorkflowTransition(tr)} style={styles.wfBtn}>
                    <Text style={styles.wfBtnTxt}>{tr.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* GeoFeatures */}
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionHeader}>Puntos y Geometrías GPS ({actGeo.length})</Text>
              <TouchableOpacity onPress={() => setShowGeoModal(true)} style={styles.smallPriBtn}>
                <Text style={styles.smallPriTxt}>+ Capturar GPS</Text>
              </TouchableOpacity>
            </View>
            {actGeo.map((g) => {
              const geom = JSON.parse(g.geometry);
              const coordPreview =
                geom.type === 'Point'
                  ? `${geom.coordinates[1].toFixed(5)}, ${geom.coordinates[0].toFixed(5)}`
                  : `${geom.type} (${geom.type === 'Polygon' ? geom.coordinates[0].length : geom.coordinates.length} vértices)`;
              return (
                <View key={g.id} style={styles.subItem}>
                  <Text style={{ fontWeight: '700', fontSize: 13 }}>{g.kind} · {g.label || 'Sin nombre'}</Text>
                  <Text style={styles.meta}>{coordPreview} {g.accuracy ? `· ±${Math.round(g.accuracy)} m` : ''}</Text>
                </View>
              );
            })}
          </View>

          {/* Dynamic Form */}
          {formDef && (
            <View style={styles.card}>
              <Text style={styles.sectionHeader}>Formulario Digital en Terreno</Text>
              <DynamicFormMobile
                definition={formDef}
                values={formData}
                onChange={setFormData}
                onCaptureEvidence={handleCaptureEvidence}
                onCaptureGeo={(kind, coords, accuracy) =>
                  saveGeoFeature({
                    kind,
                    geometry: { type: 'Point', coordinates: coords },
                    label: `Punto ${kind}`,
                    status: 'Conforme',
                    observations: '',
                    accuracy: accuracy ?? null,
                  })
                }
              />
            </View>
          )}

          {/* Evidences list */}
          <View style={styles.card}>
            <Text style={styles.sectionHeader}>Evidencias Capturadas ({actEvidences.length})</Text>
            {actEvidences.length === 0 ? (
              <Text style={styles.meta}>Sin evidencias aún.</Text>
            ) : (
              actEvidences.map((ev) => (
                <View key={ev.id} style={styles.subItem}>
                  <Text style={{ fontWeight: '600', fontSize: 12 }}>
                    {ev.kind} · {ev.fileName || ev.source} {ev.synced ? '✓ Sincronizada' : '⏳ Pendiente'}
                  </Text>
                  <Text style={styles.meta}>{new Date(ev.capturedAt).toLocaleString('es-CL')}</Text>
                </View>
              ))
            )}
          </View>

          <TouchableOpacity onPress={saveOfflineProgress} style={styles.primaryBtn}>
            <Text style={styles.primaryTxt}>Guardar Avance en Dispositivo</Text>
          </TouchableOpacity>
        </ScrollView>

        <GeoCaptureModal visible={showGeoModal} onSave={saveGeoFeature} onClose={() => setShowGeoModal(false)} />
      </SafeAreaView>
    );
  }

  const pendingTotal = queueItems.filter((q) => q.status === 'PENDING').length + pendingEvCount;
  const filteredActivities = activities.filter((a) => {
    const matchText =
      !search.trim() ||
      a.folio.toLowerCase().includes(search.toLowerCase()) ||
      a.title.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || a.status === statusFilter;
    return matchText && matchStatus;
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>TerrenoCNR</Text>
        <TouchableOpacity onPress={handleSync} disabled={syncing}>
          <Text style={styles.headerLink}>{syncing ? 'Sincronizando...' : `⟳ Sync (${pendingTotal})`}</Text>
        </TouchableOpacity>
      </View>

      {tab === 'activities' && (
        <View style={{ flex: 1 }}>
          <View style={styles.toolbar}>
            <TextInput
              style={[styles.input, { flex: 1, paddingVertical: 8 }]}
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar folio o título..."
            />
            <TouchableOpacity onPress={() => setShowNewModal(true)} style={styles.smallPriBtn}>
              <Text style={styles.smallPriTxt}>+ Nueva OT</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 42, paddingHorizontal: 12 }}>
            {['', 'ASIGNADA', 'EN_EJECUCION', 'EN_REVISION', 'CERRADA'].map((st) => (
              <TouchableOpacity
                key={st || 'ALL'}
                onPress={() => setStatusFilter(st)}
                style={[styles.filterChip, statusFilter === st && styles.filterChipActive]}
              >
                <Text style={[styles.filterTxt, statusFilter === st && { color: '#fff' }]}>{st || 'Todas'}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <FlatList
            data={filteredActivities}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 14, gap: 10 }}
            ListEmptyComponent={<Text style={styles.empty}>No hay actividades. Presione Sync.</Text>}
            renderItem={({ item }) => (
              <TouchableOpacity onPress={() => openActivity(item)} style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.folio}>{item.folio}</Text>
                  <Text style={styles.badge}>{item.status}</Text>
                </View>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.meta}>
                  {item.typeName} · {item.priority} · {item.progress}%
                </Text>
                {item.address ? <Text style={styles.meta}>📍 {item.address}</Text> : null}
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {tab === 'map' && (
        <FlatList
          data={allGeo}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 14, gap: 10 }}
          ListEmptyComponent={<Text style={styles.empty}>Sin puntos o geometrías GPS capturadas localmente.</Text>}
          renderItem={({ item }) => {
            const geom = JSON.parse(item.geometry);
            const firstPt =
              geom.type === 'Point'
                ? geom.coordinates
                : geom.type === 'Polygon'
                  ? geom.coordinates[0][0]
                  : geom.coordinates[0];
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
                <TouchableOpacity
                  onPress={() => Linking.openURL(`https://www.openstreetmap.org/?mlat=${firstPt[1]}&mlon=${firstPt[0]}#map=16/${firstPt[1]}/${firstPt[0]}`)}
                  style={{ marginTop: 6 }}
                >
                  <Text style={{ color: '#0284c7', fontWeight: '700', fontSize: 12 }}>Abrir ubicación en Mapa →</Text>
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}

      {tab === 'sync' && (
        <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }}>
          <View style={styles.card}>
            <Text style={styles.sectionHeader}>Usuario Conectado</Text>
            <Text style={styles.cardTitle}>{user?.name}</Text>
            <Text style={styles.meta}>{user?.email} · Rol: {user?.role}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionHeader}>Estado Cola Offline</Text>
            <Text style={styles.meta}>Mutaciones en cola: {queueItems.length}</Text>
            <Text style={styles.meta}>Evidencias pendientes de subida: {pendingEvCount}</Text>
            <TouchableOpacity onPress={handleSync} disabled={syncing} style={[styles.primaryBtn, { marginTop: 12 }]}>
              <Text style={styles.primaryTxt}>{syncing ? 'Sincronizando...' : 'Sincronizar Ahora'}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={async () => {
              await clearSession();
              setLoggedIn(false);
            }}
            style={[styles.card, { alignItems: 'center' }]}
          >
            <Text style={{ color: '#dc2626', fontWeight: '700' }}>Cerrar Sesión</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Bottom Tab Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity onPress={() => setTab('activities')} style={styles.tabItem}>
          <Text style={[styles.tabTxt, tab === 'activities' && styles.tabTxtActive]}>📋 Actividades</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setTab('map')} style={styles.tabItem}>
          <Text style={[styles.tabTxt, tab === 'map' && styles.tabTxtActive]}>🗺️ GPS ({allGeo.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setTab('sync')} style={styles.tabItem}>
          <Text style={[styles.tabTxt, tab === 'sync' && styles.tabTxtActive]}>🔄 Sync ({pendingTotal})</Text>
        </TouchableOpacity>
      </View>

      <NewActivityModal visible={showNewModal} types={types} onCreate={handleCreateActivity} onClose={() => setShowNewModal(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  loginContainer: { flex: 1, backgroundColor: '#f1f5f9', justifyContent: 'center', padding: 20 },
  loginCard: { backgroundColor: '#fff', padding: 24, borderRadius: 14, gap: 12 },
  brand: { fontSize: 22, fontWeight: '800', color: '#0f4c81', textAlign: 'center' },
  sub: { fontSize: 12, color: '#64748b', textAlign: 'center', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 10, backgroundColor: '#fff', fontSize: 13 },
  primaryBtn: { backgroundColor: '#0f4c81', padding: 14, borderRadius: 10, alignItems: 'center' },
  primaryTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  smallPriBtn: { backgroundColor: '#0f4c81', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  smallPriTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },
  header: { backgroundColor: '#0f4c81', paddingTop: 42, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  headerLink: { color: '#bae6fd', fontSize: 13, fontWeight: '700' },
  toolbar: { flexDirection: 'row', gap: 8, padding: 12, alignItems: 'center' },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#e2e8f0', marginRight: 6, height: 30 },
  filterChipActive: { backgroundColor: '#0f4c81' },
  filterTxt: { fontSize: 11, fontWeight: '700', color: '#334155' },
  card: { backgroundColor: '#fff', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionHeader: { fontSize: 14, fontWeight: '800', color: '#0f4c81', marginBottom: 8 },
  wfBtn: { backgroundColor: '#1e293b', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  wfBtnTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  subItem: { borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 8, marginTop: 8 },
  folio: { fontWeight: '800', color: '#0284c7', fontSize: 13 },
  badge: { fontSize: 11, fontWeight: '700', color: '#1e40af', backgroundColor: '#dbeafe', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginTop: 4 },
  meta: { fontSize: 12, color: '#64748b', marginTop: 3 },
  empty: { textAlign: 'center', color: '#64748b', marginTop: 40 },
  tabBar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#cbd5e1', backgroundColor: '#fff', paddingBottom: 14, paddingTop: 10 },
  tabItem: { flex: 1, alignItems: 'center' },
  tabTxt: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  tabTxtActive: { color: '#0f4c81', fontWeight: '800' },
});
