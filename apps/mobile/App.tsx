import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
  AppState,
  Switch,
  Image,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Crypto from 'expo-crypto';
import * as Network from 'expo-network';
import * as Location from 'expo-location';
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
import { QrScannerModal } from './src/components/QrScannerModal';
import { GobStripe, BrandEmblem } from './src/components/GobBrand';
import { MobileDashboard } from './src/components/MobileDashboard';
import { MobileKanban } from './src/components/MobileKanban';
import { MobileMapView } from './src/components/MobileMapView';
import { MiniLeafletMap } from './src/components/MiniLeafletMap';
import { COLORS, getStatusStyle } from './src/theme';

type Tab = 'dashboard' | 'activities' | 'map' | 'sync';

function AppContent() {
  const insets = useSafeAreaInsets();
  const topSafe = Math.max(insets.top, Platform.OS === 'android' ? 32 : 16);
  const bottomSafe = Math.max(insets.bottom, Platform.OS === 'android' ? 48 : 16);
  const [ready, setReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [user, setUser] = useState<{ id: string; name: string; email: string; role: string; permissions: string[] } | null>(null);
  const [apiUrlInput, setApiUrlInput] = useState('http://192.168.1.158:4000');
  const [email, setEmail] = useState('terreno@cnr.gob.cl');
  const [password, setPassword] = useState('Cnr2026!Demo');

  const [tab, setTab] = useState<Tab>('dashboard');
  const [actView, setActView] = useState<'list' | 'kanban'>('list');
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
  const [showOtScanner, setShowOtScanner] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [networkType, setNetworkType] = useState('UNKNOWN');
  const [autoSync, setAutoSync] = useState(true);
  const [lastAutoSyncAt, setLastAutoSyncAt] = useState<string | null>(null);
  const [devicePos, setDevicePos] = useState<{ lat: number; lng: number } | null>(null);
  const [detailFocus, setDetailFocus] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);
  const syncingRef = useRef(false);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selected?.id ?? null;

  const locateDeviceForDetail = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude, zoom: 16 };
      setDevicePos({ lat: coords.lat, lng: coords.lng });
      setDetailFocus(coords);
    } catch {
      // ignore if GPS unavailable
    }
  };

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
      const res = await apiFetch<{ accessToken: string; refreshToken?: string; user: any }>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, device: 'mobile-app' }),
      });
      await setSession(res.accessToken, res.user, res.refreshToken);
      setUser(res.user);
      setLoggedIn(true);
      await handleSync();
    } catch (e: any) {
      Alert.alert('Error de acceso', e.message);
    }
  };

  const handleSync = async (silent = false) => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const summary = await syncAll();
      await refreshLocal();
      if (selectedIdRef.current) {
        const db = await getDb();
        const fresh = await db.getFirstAsync<any>(`SELECT * FROM activities WHERE id = ?`, [selectedIdRef.current]);
        if (fresh) {
          setSelected(fresh);
          setActGeo(await db.getAllAsync<any>(`SELECT * FROM geo_features WHERE activityId = ? ORDER BY capturedAt DESC`, [fresh.id]));
          setActEvidences(await db.getAllAsync<any>(`SELECT * FROM evidences WHERE activityId = ? ORDER BY capturedAt DESC`, [fresh.id]));
        }
      }
      setLastAutoSyncAt(new Date().toLocaleTimeString('es-CL'));
      if (!silent) {
        Alert.alert(
          'Sincronización Completa',
          `Actividades: ${summary.pulledActivities}\nMutaciones enviadas: ${summary.pushedMutations}\nEvidencias subidas: ${summary.uploadedEvidences}`,
        );
      }
    } catch (e: any) {
      await refreshLocal();
      if (!silent) {
        Alert.alert('Modo Sin Conexión (Offline)', `Los datos locales se mantienen seguros. (${e.message})`);
      }
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  };

  useEffect(() => {
    Network.getNetworkStateAsync()
      .then((s) => {
        setIsOnline(Boolean(s.isConnected && s.isInternetReachable !== false));
        setNetworkType(String(s.type ?? 'UNKNOWN'));
      })
      .catch(() => undefined);

    const netSub = Network.addNetworkStateListener((s) => {
      const online = Boolean(s.isConnected && s.isInternetReachable !== false);
      setIsOnline(online);
      setNetworkType(String(s.type ?? 'UNKNOWN'));
      if (online && autoSync && loggedIn) {
        handleSync(true);
      }
    });

    const appSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && autoSync && loggedIn) {
        Network.getNetworkStateAsync()
          .then((s) => {
            if (s.isConnected && s.isInternetReachable !== false) {
              handleSync(true);
            }
          })
          .catch(() => undefined);
      }
    });

    const pollId = setInterval(() => {
      if (autoSync && loggedIn && isOnline && !selected && !syncingRef.current) {
        void handleSync(true);
      }
    }, 15000);

    return () => {
      clearInterval(pollId);
      netSub.remove();
      appSub.remove();
    };
  }, [autoSync, loggedIn, isOnline, selected]);

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
    setDetailFocus(null);
    void locateDeviceForDetail();
  };

  const saveOfflineProgress = async () => {
    if (!selected) return;
    const db = await getDb();
    const now = new Date().toISOString();
    await db.runAsync(`UPDATE activities SET data = ?, updatedAt = ? WHERE id = ?`, [JSON.stringify(formData), now, selected.id]);
    const payload: Record<string, unknown> = { data: formData, baseVersion: selected.version };
    if (String(selected.folio || '').startsWith('LOCAL-')) {
      payload.typeId = selected.typeId;
      payload.title = selected.title;
      payload.description = selected.description || null;
      payload.priority = selected.priority;
      payload.address = selected.address || null;
    }
    await enqueueMutation('activity', 'upsert', selected.id, payload);
    await refreshLocal();
    const folio = selected.folio;
    setSelected(null);
    if (isOnline && autoSync) {
      void handleSync(true);
    }
    Alert.alert(
      '¡Guardado con éxito!',
      isOnline && autoSync
        ? `El avance de ${folio} se guardó y se está sincronizando automáticamente.`
        : `El avance de ${folio} se guardó en el dispositivo y quedó listo para sincronizar.`,
    );
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
    if (isOnline && autoSync) {
      void handleSync(true);
    }
    Alert.alert('Estado Actualizado', `La actividad pasó a ${tr.to}.`);
  };

  const handleCaptureEvidence = async (ev: CapturedEvidence) => {
    if (!selected) return;
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO evidences (id, activityId, kind, fieldKey, fileUri, fileName, mimeType, note, transcript, source, lat, lng, accuracy, capturedAt, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        ev.id,
        selected.id,
        ev.kind,
        ev.fieldKey,
        ev.fileUri ?? null,
        ev.fileName ?? null,
        ev.mimeType ?? null,
        ev.note ?? null,
        ev.transcript ?? null,
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
    if (isOnline && autoSync) {
      void handleSync(true);
    }
    Alert.alert('Geometría Guardada', `${input.kind} "${input.label}" guardado.`);
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
    await openActivity({
      id,
      folio,
      typeId: input.typeId,
      typeName: t?.name ?? 'Actividad',
      title: input.title,
      description: input.description,
      priority: input.priority,
      status: 'PENDIENTE',
      progress: 0,
      formVersionId,
      data: '{}',
      address: input.address,
      version: 1,
      updatedAt: now,
    });
    if (isOnline && autoSync) {
      void handleSync(true);
    }
  };

  const handleScanOtQr = async (raw: string) => {
    setShowOtScanner(false);
    const trimmed = raw.trim();
    let candidateId = '';
    let candidateFolio = '';

    if (trimmed.startsWith('TERRENOCNR:OT:')) {
      const parts = trimmed.split(':');
      candidateId = parts[2] ?? '';
      candidateFolio = parts[3] ?? '';
    } else if (trimmed.includes('/actividades/')) {
      candidateId = trimmed.split('/actividades/')[1]?.split(/[?#]/)[0] ?? '';
    } else {
      candidateId = trimmed;
      candidateFolio = trimmed;
    }

    const db = await getDb();
    let found = await db.getFirstAsync<any>(
      `SELECT * FROM activities WHERE id = ? OR UPPER(folio) = UPPER(?) LIMIT 1`,
      [candidateId, candidateFolio || candidateId],
    );

    if (!found && (candidateId || candidateFolio)) {
      try {
        const res = await apiFetch<{ data: any[] }>(
          `/api/v1/activities?q=${encodeURIComponent(candidateFolio || candidateId)}`,
        );
        const match = res.data?.find(
          (a) => a.id === candidateId || a.folio?.toUpperCase() === (candidateFolio || candidateId).toUpperCase(),
        );
        if (match) {
          await db.runAsync(
            `INSERT OR REPLACE INTO activities (id, folio, typeId, typeName, title, description, priority, status, progress, formVersionId, data, address, lat, lng, version, updatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              match.id,
              match.folio,
              match.typeId,
              match.type?.name ?? 'Actividad',
              match.title,
              match.description ?? '',
              match.priority,
              match.status,
              match.progress ?? 0,
              match.formVersionId ?? null,
              JSON.stringify(match.data ?? {}),
              match.address ?? '',
              match.lat ?? null,
              match.lng ?? null,
              match.version ?? 1,
              match.updatedAt ?? new Date().toISOString(),
            ],
          );
          await refreshLocal();
          found = await db.getFirstAsync<any>(`SELECT * FROM activities WHERE id = ?`, [match.id]);
        }
      } catch {
        // Offline or unreachable; fall through to alert
      }
    }

    if (found) {
      await openActivity(found);
    } else {
      Alert.alert('OT no encontrada', `No se encontró una orden asociada al código "${trimmed}". Sincronice si la OT es reciente.`);
    }
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
      <View style={[styles.loginContainer, { paddingTop: topSafe, paddingBottom: bottomSafe }]}>
        <StatusBar style="dark" />
        <View style={styles.loginCard}>
          <GobStripe />
          <View style={{ padding: 22, gap: 12 }}>
            <View style={{ alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <BrandEmblem size={48} />
              <Text style={styles.brand}>TerrenoCNR Móvil</Text>
              <Text style={styles.sub}>Comisión Nacional de Riego · Ministerio de Agricultura</Text>
            </View>
            <TextInput style={styles.input} value={apiUrlInput} onChangeText={setApiUrlInput} placeholder="URL API" autoCapitalize="none" />
            <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Correo institucional" autoCapitalize="none" />
            <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Contraseña" secureTextEntry />
            <TouchableOpacity onPress={handleLogin} style={styles.primaryBtn}>
              <Text style={styles.primaryTxt}>Ingresar a Terreno</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 4 }}>
              <TouchableOpacity
                onPress={() => {
                  setEmail('terreno@cnr.gob.cl');
                  setPassword('Cnr2026!Demo');
                }}
                style={styles.demoChip}
              >
                <Text style={styles.demoChipTxt}>Inspector Terreno</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setEmail('admin@cnr.gob.cl');
                  setPassword('Cnr2026!Demo');
                }}
                style={styles.demoChip}
              >
                <Text style={styles.demoChipTxt}>Admin CNR</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  }

  // Activity Detail Screen
  if (selected) {
    const stStyle = getStatusStyle(selected.status);
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={[styles.headerWrap, { paddingTop: topSafe }]}>
          <GobStripe />
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setSelected(null)}>
              <Text style={styles.headerLink}>← Volver</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{selected.folio}</Text>
            <TouchableOpacity onPress={saveOfflineProgress} style={styles.headerPill}>
              <Text style={styles.headerPillTxt}>Guardar</Text>
            </TouchableOpacity>
          </View>
        </View>
        <ScrollView contentContainerStyle={{ padding: 14, gap: 14, paddingBottom: bottomSafe + 24 }}>
          <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: stStyle.border }]}>
            <View style={styles.rowBetween}>
              <Text style={[styles.badge, { backgroundColor: stStyle.bg, color: stStyle.fg }]}>{selected.status}</Text>
              <Text style={styles.meta}>Prioridad: {selected.priority} · {selected.progress}%</Text>
            </View>
            <Text style={styles.cardTitle}>{selected.title}</Text>
            {selected.address ? <Text style={styles.meta}>📍 {selected.address}</Text> : null}
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.min(100, Math.max(0, Number(selected.progress) || 0))}%` }]} />
            </View>
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
            <View style={[styles.rowBetween, { marginBottom: 10, gap: 6 }]}>
              <Text style={[styles.sectionHeader, { marginBottom: 0, flex: 1 }]}>Puntos y Geometrías GPS ({actGeo.length})</Text>
              <TouchableOpacity
                onPress={locateDeviceForDetail}
                style={[styles.smallPriBtn, { backgroundColor: COLORS.water, paddingHorizontal: 10 }]}
              >
                <Text style={styles.smallPriTxt}>🎯 Mi ubicación</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowGeoModal(true)} style={styles.smallPriBtn}>
                <Text style={styles.smallPriTxt}>+ Capturar</Text>
              </TouchableOpacity>
            </View>
            <MiniLeafletMap
              geoFeatures={actGeo}
              centerLat={selected.lat}
              centerLng={selected.lng}
              userLat={devicePos?.lat ?? null}
              userLng={devicePos?.lng ?? null}
              focusCoords={detailFocus}
              height={210}
            />
            {actGeo.map((g) => {
              const geom = JSON.parse(g.geometry);
              const coordPreview =
                geom.type === 'Point'
                  ? `${geom.coordinates[1].toFixed(5)}, ${geom.coordinates[0].toFixed(5)}`
                  : `${geom.type} (${geom.type === 'Polygon' ? geom.coordinates[0].length : geom.coordinates.length} vértices)`;
              return (
                <View key={g.id} style={[styles.subItem, styles.rowBetween]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', fontSize: 13 }}>{g.kind} · {g.label || 'Sin nombre'}</Text>
                    <Text style={styles.meta}>{coordPreview} {g.accuracy ? `· ±${Math.round(g.accuracy)} m` : ''}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={async () => {
                      const db = await getDb();
                      await db.runAsync(`DELETE FROM geo_features WHERE id = ?`, [g.id]);
                      setActGeo((prev) => prev.filter((x) => x.id !== g.id));
                      await refreshLocal();
                    }}
                    style={{ paddingHorizontal: 8, paddingVertical: 4 }}
                  >
                    <Text style={{ color: COLORS.danger, fontSize: 12, fontWeight: '700' }}>Borrar</Text>
                  </TouchableOpacity>
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
                onOpenGeoMap={() => setShowGeoModal(true)}
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
                <View key={ev.id} style={[styles.subItem, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
                  {ev.kind === 'PHOTO' && ev.fileUri ? (
                    <Image source={{ uri: ev.fileUri }} style={{ width: 46, height: 46, borderRadius: 6, backgroundColor: '#e2e8f0' }} />
                  ) : null}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '600', fontSize: 12 }}>
                      {ev.kind === 'AUDIO' ? '🎙️ ' : ev.kind === 'PHOTO' ? '📷 ' : ''}
                      {ev.kind} · {ev.fileName || ev.source} {ev.synced ? '✓ Sincronizada' : '⏳ Pendiente'}
                    </Text>
                    {ev.transcript ? <Text style={{ fontSize: 11, color: COLORS.text, marginTop: 2 }}>“{ev.transcript}”</Text> : null}
                    <Text style={styles.meta}>{new Date(ev.capturedAt).toLocaleString('es-CL')}</Text>
                  </View>
                </View>
              ))
            )}
          </View>

          <TouchableOpacity onPress={saveOfflineProgress} style={styles.primaryBtn}>
            <Text style={styles.primaryTxt}>Guardar Avance en Dispositivo</Text>
          </TouchableOpacity>
        </ScrollView>

        <GeoCaptureModal visible={showGeoModal} onSave={saveGeoFeature} onClose={() => setShowGeoModal(false)} />
      </View>
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
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={[styles.headerWrap, { paddingTop: topSafe }]}>
        <GobStripe />
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <BrandEmblem size={30} />
            <View>
              <Text style={styles.headerTitle}>TerrenoCNR</Text>
              <Text style={{ color: '#a7f3d0', fontSize: 10, fontWeight: '600' }}>CNR · Min. Agricultura</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TouchableOpacity onPress={() => setShowOtScanner(true)} style={[styles.headerPill, { backgroundColor: COLORS.water }]}>
              <Text style={styles.headerPillTxt}>📷 QR OT</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleSync(false)}
              disabled={syncing}
              style={[
                styles.headerPill,
                { backgroundColor: syncing ? '#475569' : pendingTotal > 0 ? '#d97706' : COLORS.green },
              ]}
            >
              <Text style={styles.headerPillTxt}>
                {syncing ? '⟳ Sync...' : pendingTotal > 0 ? `⟳ Subir (${pendingTotal})` : '✓ Al día'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {tab === 'dashboard' && (
        <MobileDashboard
          activities={activities}
          geoCount={allGeo.length}
          pendingCount={pendingTotal}
          onSelectActivity={openActivity}
          onNewActivity={() => setShowNewModal(true)}
          onGoKanban={() => {
            setActView('kanban');
            setTab('activities');
          }}
        />
      )}

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

          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, marginBottom: 8 }}>
            <TouchableOpacity
              onPress={() => setActView('list')}
              style={[styles.viewToggleBtn, actView === 'list' && styles.viewToggleActive]}
            >
              <Text style={[styles.viewToggleTxt, actView === 'list' && { color: '#fff' }]}>📋 Listado</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActView('kanban')}
              style={[styles.viewToggleBtn, actView === 'kanban' && { backgroundColor: COLORS.green, borderColor: COLORS.green }]}
            >
              <Text style={[styles.viewToggleTxt, actView === 'kanban' && { color: '#fff' }]}>🗂️ Kanban</Text>
            </TouchableOpacity>
          </View>

          {actView === 'kanban' ? (
            <MobileKanban activities={filteredActivities} onSelectActivity={openActivity} />
          ) : (
            <>
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
                refreshing={syncing}
                onRefresh={() => void handleSync(true)}
                contentContainerStyle={{ padding: 14, gap: 10 }}
                ListEmptyComponent={<Text style={styles.empty}>No hay actividades. Presione Sync.</Text>}
                renderItem={({ item }) => {
                  const st = getStatusStyle(item.status);
                  return (
                    <TouchableOpacity onPress={() => openActivity(item)} style={[styles.card, { borderLeftWidth: 4, borderLeftColor: st.border }]}>
                      <View style={styles.rowBetween}>
                        <Text style={styles.folio}>{item.folio}</Text>
                        <Text style={[styles.badge, { backgroundColor: st.bg, color: st.fg }]}>{item.status}</Text>
                      </View>
                      <Text style={styles.cardTitle}>{item.title}</Text>
                      <Text style={styles.meta}>
                        {item.typeName} · {item.priority} · {item.progress}%
                      </Text>
                      {item.address ? <Text style={styles.meta}>📍 {item.address}</Text> : null}
                    </TouchableOpacity>
                  );
                }}
              />
            </>
          )}
        </View>
      )}

      {tab === 'map' && (
        <MobileMapView activities={activities} geoFeatures={allGeo} onSelectActivity={openActivity} />
      )}

      {tab === 'sync' && (
        <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }}>
          <View style={styles.card}>
            <Text style={styles.sectionHeader}>Usuario Conectado</Text>
            <Text style={styles.cardTitle}>{user?.name}</Text>
            <Text style={styles.meta}>{user?.email} · Rol: {user?.role}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionHeader}>Estado de Red y Sincronización</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: isOnline ? COLORS.green : COLORS.amber, marginBottom: 4 }}>
              {isOnline ? `🟢 En línea (${networkType})` : '🟠 Sin conexión (Modo Offline)'}
            </Text>
            <Text style={styles.meta}>
              Mutaciones pendientes: {queueItems.filter((q) => q.status === 'PENDING').length}
            </Text>
            {queueItems.some((q) => q.status === 'REJECTED') && (
              <View style={{ backgroundColor: '#fef2f2', borderRadius: 8, padding: 10, marginVertical: 6, borderWidth: 1, borderColor: '#fecaca' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#b91c1c' }}>
                  Mutaciones con error / rechazadas: {queueItems.filter((q) => q.status === 'REJECTED').length}
                </Text>
                <Text style={{ fontSize: 11, color: '#991b1b', marginTop: 2 }} numberOfLines={2}>
                  {queueItems.find((q) => q.status === 'REJECTED')?.error || 'Error al sincronizar en servidor'}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <TouchableOpacity
                    onPress={async () => {
                      const db = await getDb();
                      await db.runAsync(`UPDATE sync_queue SET status = 'PENDING', error = NULL WHERE status = 'REJECTED'`);
                      await refreshLocal();
                      void handleSync(false);
                    }}
                    style={{ backgroundColor: '#0284c7', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 }}
                  >
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Reintentar fallidas</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={async () => {
                      const db = await getDb();
                      await db.runAsync(`DELETE FROM sync_queue WHERE status = 'REJECTED'`);
                      await refreshLocal();
                    }}
                    style={{ backgroundColor: '#fee2e2', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 }}
                  >
                    <Text style={{ color: '#b91c1c', fontSize: 11, fontWeight: '700' }}>Descartar fallidas</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            <Text style={styles.meta}>Evidencias pendientes de subida: {pendingEvCount}</Text>
            {lastAutoSyncAt && <Text style={styles.meta}>Última sync: {lastAutoSyncAt}</Text>}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#eef3f1' }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.text, flex: 1 }}>
                Auto-sincronizar al detectar Wi-Fi o Datos
              </Text>
              <Switch value={autoSync} onValueChange={setAutoSync} trackColor={{ true: COLORS.green }} />
            </View>
            <TouchableOpacity onPress={() => handleSync(false)} disabled={syncing} style={[styles.primaryBtn, { marginTop: 12 }]}>
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
      <View style={[styles.tabBar, { paddingBottom: bottomSafe + 8 }]}>
        <TouchableOpacity onPress={() => setTab('dashboard')} style={[styles.tabItem, tab === 'dashboard' && styles.tabItemActive]}>
          <Text style={[styles.tabTxt, tab === 'dashboard' && styles.tabTxtActive]}>📊 Panel</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setTab('activities')} style={[styles.tabItem, tab === 'activities' && styles.tabItemActive]}>
          <Text style={[styles.tabTxt, tab === 'activities' && styles.tabTxtActive]}>📋 OTs</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setTab('map')} style={[styles.tabItem, tab === 'map' && styles.tabItemActive]}>
          <Text style={[styles.tabTxt, tab === 'map' && styles.tabTxtActive]}>🗺️ Mapa</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setTab('sync')} style={[styles.tabItem, tab === 'sync' && styles.tabItemActive]}>
          <Text style={[styles.tabTxt, tab === 'sync' && styles.tabTxtActive]}>⚙️ Cuenta</Text>
        </TouchableOpacity>
      </View>

      <NewActivityModal visible={showNewModal} types={types} onCreate={handleCreateActivity} onClose={() => setShowNewModal(false)} />
      <QrScannerModal visible={showOtScanner} onScanned={handleScanOtQr} onClose={() => setShowOtScanner(false)} />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg },
  container: { flex: 1, backgroundColor: COLORS.bg },
  loginContainer: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', padding: 20 },
  loginCard: { backgroundColor: COLORS.surface, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border, elevation: 4 },
  brand: { fontSize: 22, fontWeight: '800', color: COLORS.primary, textAlign: 'center' },
  sub: { fontSize: 12, color: COLORS.green, fontWeight: '600', textAlign: 'center', marginBottom: 4 },
  demoChip: { backgroundColor: COLORS.greenSoft, borderColor: COLORS.border, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  demoChipTxt: { fontSize: 11, fontWeight: '700', color: COLORS.primary },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 11, backgroundColor: COLORS.surface, fontSize: 13, color: COLORS.text },
  primaryBtn: { backgroundColor: COLORS.primary, padding: 14, borderRadius: 10, alignItems: 'center' },
  primaryTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  smallPriBtn: { backgroundColor: COLORS.green, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 10 },
  smallPriTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },
  headerWrap: { backgroundColor: COLORS.primary },
  header: { backgroundColor: COLORS.primary, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  headerLink: { color: '#a7f3d0', fontSize: 13, fontWeight: '700' },
  headerPill: { backgroundColor: COLORS.green, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999 },
  headerPillTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  toolbar: { flexDirection: 'row', gap: 8, padding: 12, alignItems: 'center' },
  viewToggleBtn: { flex: 1, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, alignItems: 'center' },
  viewToggleActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  viewToggleTxt: { fontSize: 12, fontWeight: '700', color: COLORS.text },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#e2ebe7', marginRight: 6, height: 30 },
  filterChipActive: { backgroundColor: COLORS.primary },
  filterTxt: { fontSize: 11, fontWeight: '700', color: COLORS.text },
  card: { backgroundColor: COLORS.surface, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, elevation: 1 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionHeader: { fontSize: 14, fontWeight: '800', color: COLORS.primary, marginBottom: 8 },
  wfBtn: { backgroundColor: COLORS.green, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8 },
  wfBtnTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  subItem: { borderTopWidth: 1, borderTopColor: COLORS.bg, paddingTop: 8, marginTop: 8 },
  folio: { fontWeight: '800', color: COLORS.water, fontSize: 13 },
  badge: { fontSize: 11, fontWeight: '700', color: COLORS.primary, backgroundColor: COLORS.waterSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginTop: 4 },
  meta: { fontSize: 12, color: COLORS.muted, marginTop: 3 },
  progressTrack: { height: 6, backgroundColor: '#e2ebe7', borderRadius: 999, marginTop: 10, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: COLORS.green, borderRadius: 999 },
  empty: { textAlign: 'center', color: COLORS.muted, marginTop: 40 },
  tabBar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.surface, paddingTop: 0 },
  tabItem: { flex: 1, alignItems: 'center', paddingTop: 10, borderTopWidth: 3, borderTopColor: 'transparent' },
  tabItemActive: { borderTopColor: COLORS.green },
  tabTxt: { fontSize: 12, fontWeight: '600', color: COLORS.muted },
  tabTxtActive: { color: COLORS.primary, fontWeight: '800' },
});
