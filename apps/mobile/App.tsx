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
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import * as Crypto from 'expo-crypto';
import type { FormDefinition } from '@terreno/shared';
import { getDb } from './src/db/sqlite';
import { apiFetch, clearSession, getApiUrl, getToken, setApiUrl, setSession } from './src/api/client';
import { enqueueMutation, syncAll } from './src/sync/syncEngine';
import { DynamicFormMobile, type CapturedEvidence } from './src/components/DynamicFormMobile';

export default function App() {
  const [ready, setReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [apiUrlInput, setApiUrlInput] = useState('http://10.0.2.2:4000');
  const [email, setEmail] = useState('terreno@cnr.gob.cl');
  const [password, setPassword] = useState('Cnr2026!Demo');
  const [activities, setActivities] = useState<any[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [selected, setSelected] = useState<any | null>(null);
  const [formDef, setFormDef] = useState<FormDefinition | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [syncing, setSyncing] = useState(false);

  const refreshLocal = async () => {
    const db = await getDb();
    const rows = await db.getAllAsync<any>(`SELECT * FROM activities ORDER BY updatedAt DESC`);
    setActivities(rows);
    const q = await db.getFirstAsync<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM sync_queue WHERE status = 'PENDING'`);
    const ev = await db.getFirstAsync<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM evidences WHERE synced = 0`);
    setPendingCount((q?.cnt ?? 0) + (ev?.cnt ?? 0));
  };

  useEffect(() => {
    (async () => {
      setApiUrlInput(await getApiUrl());
      const tok = await getToken();
      if (tok) {
        setLoggedIn(true);
        await refreshLocal();
      }
      setReady(true);
    })();
  }, []);

  const handleLogin = async () => {
    try {
      await setApiUrl(apiUrlInput);
      const res = await apiFetch<{ accessToken: string; user: unknown }>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, device: 'mobile-app' }),
      });
      await setSession(res.accessToken, res.user);
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
      const fv = await db.getFirstAsync<{ definition: string }>(`SELECT definition FROM form_versions WHERE id = ?`, [
        act.formVersionId,
      ]);
      setFormDef(fv ? JSON.parse(fv.definition) : null);
    } else {
      setFormDef(null);
    }
  };

  const saveOfflineProgress = async () => {
    if (!selected) return;
    const db = await getDb();
    const now = new Date().toISOString();
    await db.runAsync(`UPDATE activities SET data = ?, updatedAt = ? WHERE id = ?`, [
      JSON.stringify(formData),
      now,
      selected.id,
    ]);
    await enqueueMutation('activity', 'upsert', selected.id, {
      data: formData,
      baseVersion: selected.version,
    });
    await refreshLocal();
    Alert.alert('Guardado Offline', 'Cambios guardados en SQLite local y encolados para sincronizar.');
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
  };

  const handleCaptureGeo = async (
    kind: 'POINT' | 'LINE' | 'POLYGON' | 'TRACK',
    coords: [number, number],
    accuracy?: number | null,
  ) => {
    if (!selected) return;
    const db = await getDb();
    const id = Crypto.randomUUID();
    const now = new Date().toISOString();
    const geometry = { type: 'Point', coordinates: coords };
    await db.runAsync(
      `INSERT INTO geo_features (id, activityId, kind, geometry, accuracy, capturedAt, synced) VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [id, selected.id, kind, JSON.stringify(geometry), accuracy ?? null, now],
    );
    await enqueueMutation('geoFeature', 'upsert', id, {
      activityId: selected.id,
      kind: 'POINT',
      geometry,
      accuracy: accuracy ?? undefined,
      capturedAt: now,
    });
    await refreshLocal();
  };

  const captureQuickGps = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Permiso GPS requerido');
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    await handleCaptureGeo('POINT', [pos.coords.longitude, pos.coords.latitude], pos.coords.accuracy);
    Alert.alert('Punto GPS registrado offline', `Precisión: ±${Math.round(pos.coords.accuracy ?? 0)} m`);
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
          <Text style={styles.sub}>Comisión Nacional de Riego · Modo Offline</Text>
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
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{selected.title}</Text>
            <Text style={styles.meta}>Estado: {selected.status} · Prioridad: {selected.priority}</Text>
            <TouchableOpacity onPress={captureQuickGps} style={[styles.secondaryBtn, { marginTop: 10 }]}>
              <Text style={styles.secondaryTxt}>📍 Registrar Punto GPS Rápido</Text>
            </TouchableOpacity>
          </View>
          {formDef ? (
            <View style={styles.card}>
              <DynamicFormMobile
                definition={formDef}
                values={formData}
                onChange={setFormData}
                onCaptureEvidence={handleCaptureEvidence}
                onCaptureGeo={handleCaptureGeo}
              />
            </View>
          ) : (
            <Text style={styles.meta}>Sin formulario asociado.</Text>
          )}
          <TouchableOpacity onPress={saveOfflineProgress} style={styles.primaryBtn}>
            <Text style={styles.primaryTxt}>Guardar en Dispositivo (Offline)</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>TerrenoCNR</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity onPress={handleSync} disabled={syncing}>
            <Text style={styles.headerLink}>{syncing ? 'Sincronizando...' : `Sincronizar (${pendingCount})`}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={async () => {
              await clearSession();
              setLoggedIn(false);
            }}
          >
            <Text style={styles.headerLink}>Salir</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={activities}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        ListEmptyComponent={<Text style={styles.empty}>No hay actividades descargadas. Presione Sincronizar.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => openActivity(item)} style={styles.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={styles.folio}>{item.folio}</Text>
              <Text style={styles.badge}>{item.status}</Text>
            </View>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.meta}>{item.typeName} · {item.priority}</Text>
          </TouchableOpacity>
        )}
      />
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
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 12, backgroundColor: '#fff' },
  primaryBtn: { backgroundColor: '#0f4c81', padding: 14, borderRadius: 10, alignItems: 'center' },
  primaryTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryBtn: { backgroundColor: '#e0f2fe', padding: 10, borderRadius: 8, alignItems: 'center' },
  secondaryTxt: { color: '#0369a1', fontWeight: '700', fontSize: 13 },
  header: { backgroundColor: '#0f4c81', paddingTop: 44, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  headerLink: { color: '#bae6fd', fontSize: 14, fontWeight: '600' },
  card: { backgroundColor: '#fff', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  folio: { fontWeight: '800', color: '#0284c7', fontSize: 13 },
  badge: { fontSize: 11, fontWeight: '700', color: '#334155', backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginTop: 4 },
  meta: { fontSize: 12, color: '#64748b', marginTop: 4 },
  empty: { textAlign: 'center', color: '#64748b', marginTop: 40 },
});
