import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Switch, StyleSheet, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Location from 'expo-location';
import * as Crypto from 'expo-crypto';
import { evaluateForm, type FormDefinition, type FormValues } from '@terreno/shared';
import { QrScannerModal } from './QrScannerModal';
import { SignatureModal } from './SignatureModal';
import { AudioRecorderModal } from './AudioRecorderModal';
import { AddressAutocompleteMobile } from './AddressAutocompleteMobile';
import { SignaturePreviewMobile } from './SignaturePreviewMobile';

export interface CapturedEvidence {
  id: string;
  kind: 'PHOTO' | 'FILE' | 'SIGNATURE' | 'AUDIO';
  fieldKey: string;
  fileUri?: string;
  fileName?: string;
  mimeType?: string;
  note?: string;
  transcript?: string;
  source?: string;
  lat?: number;
  lng?: number;
  accuracy?: number;
}

export function DynamicFormMobile({
  definition,
  values,
  onChange,
  onCaptureEvidence,
  onCaptureGeo,
  onOpenGeoMap,
  missingKeys = [],
  evidences = [],
}: {
  definition: FormDefinition;
  values: FormValues;
  onChange: (next: FormValues) => void;
  onCaptureEvidence: (ev: CapturedEvidence) => void;
  onCaptureGeo: (kind: 'POINT' | 'LINE' | 'POLYGON' | 'TRACK', coords: [number, number], accuracy?: number | null) => void;
  onOpenGeoMap?: (kind: 'POINT' | 'LINE' | 'POLYGON' | 'TRACK') => void;
  missingKeys?: string[];
  evidences?: { id: string; kind: string; fieldKey?: string | null; note?: string | null }[];
}) {
  const [qrField, setQrField] = useState<string | null>(null);
  const [sigField, setSigField] = useState<string | null>(null);
  const [audioField, setAudioField] = useState<{ key: string; isSpeech: boolean } | null>(null);
  const state = evaluateForm(definition, values);

  const setVal = (k: string, v: unknown) => onChange({ ...state.values, [k]: v });

  const takePhoto = async (fieldKey: string, allowGallery: boolean) => {
    const camPerm = await ImagePicker.requestCameraPermissionsAsync();
    if (!camPerm.granted) {
      Alert.alert('Permiso requerido', 'Debe autorizar la cámara.');
      return;
    }

    const runCamera = async () => {
      const res = await ImagePicker.launchCameraAsync({ quality: 0.7 });
      if (!res.canceled && res.assets[0]) {
        const asset = res.assets[0];
        const loc = await Location.getLastKnownPositionAsync().catch(() => null);
        const evId = Crypto.randomUUID();
        onCaptureEvidence({
          id: evId,
          kind: 'PHOTO',
          fieldKey,
          fileUri: asset.uri,
          fileName: asset.fileName || `foto-${Date.now()}.jpg`,
          mimeType: asset.mimeType || 'image/jpeg',
          source: 'camera',
          lat: loc?.coords.latitude,
          lng: loc?.coords.longitude,
          accuracy: loc?.coords.accuracy ?? undefined,
        });
        const cur = Array.isArray(state.values[fieldKey]) ? (state.values[fieldKey] as string[]) : [];
        setVal(fieldKey, [...cur, evId]);
      }
    };

    if (!allowGallery) {
      // Strict gallery blocking as required by TDR
      await runCamera();
      return;
    }

    Alert.alert('Adjuntar Fotografía', 'Seleccione el origen', [
      { text: 'Cámara', onPress: runCamera },
      {
        text: 'Galería',
        onPress: async () => {
          const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
          if (!res.canceled && res.assets[0]) {
            const asset = res.assets[0];
            const evId = Crypto.randomUUID();
            onCaptureEvidence({
              id: evId,
              kind: 'PHOTO',
              fieldKey,
              fileUri: asset.uri,
              fileName: asset.fileName || `galeria-${Date.now()}.jpg`,
              mimeType: asset.mimeType || 'image/jpeg',
              source: 'gallery',
            });
            const cur = Array.isArray(state.values[fieldKey]) ? (state.values[fieldKey] as string[]) : [];
            setVal(fieldKey, [...cur, evId]);
          }
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const pickFile = async (fieldKey: string) => {
    const res = await DocumentPicker.getDocumentAsync({});
    if (!res.canceled && res.assets[0]) {
      const a = res.assets[0];
      const evId = Crypto.randomUUID();
      onCaptureEvidence({
        id: evId,
        kind: 'FILE',
        fieldKey,
        fileUri: a.uri,
        fileName: a.name,
        mimeType: a.mimeType || 'application/octet-stream',
        source: 'file',
      });
      const cur = Array.isArray(state.values[fieldKey]) ? (state.values[fieldKey] as string[]) : [];
      setVal(fieldKey, [...cur, evId]);
    }
  };

  const captureGps = async (fieldKey: string, kind: 'POINT' | 'LINE' | 'POLYGON' | 'TRACK') => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Debe habilitar el GPS para capturar coordenadas.');
      return;
    }
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    onCaptureGeo(kind, [pos.coords.longitude, pos.coords.latitude], pos.coords.accuracy);
    const cur = Array.isArray(state.values[fieldKey]) ? (state.values[fieldKey] as string[]) : [];
    setVal(fieldKey, [...cur, `${pos.coords.latitude.toFixed(5)},${pos.coords.longitude.toFixed(5)}`]);
    Alert.alert('GPS Capturado', `Lat: ${pos.coords.latitude.toFixed(5)}\nLng: ${pos.coords.longitude.toFixed(5)}\nPrecisión: ±${Math.round(pos.coords.accuracy ?? 0)} m`);
  };

  return (
    <View style={styles.wrap}>
      {definition.fields.map((f) => {
        if (!state.visible[f.key]) return null;
        if (f.type === 'section') {
          return (
            <View key={f.key} style={styles.section}>
              <Text style={styles.sectionTxt}>{f.label}</Text>
            </View>
          );
        }

        const val = state.values[f.key];
        const req = state.required[f.key];
        const disabled = state.disabled[f.key];
        const isMissing = missingKeys.includes(f.key);

        return (
          <View
            key={f.key}
            style={[
              styles.field,
              isMissing && { borderWidth: 1, borderColor: '#dc2626', backgroundColor: '#fef2f2', borderRadius: 10, padding: 8 },
            ]}
          >
            <Text style={[styles.label, isMissing && { color: '#b91c1c' }]}>
              {f.label}
              {req ? <Text style={{ color: '#dc2626' }}> *</Text> : null}
              {isMissing ? <Text style={{ color: '#dc2626', fontSize: 11 }}> (Obligatorio)</Text> : null}
            </Text>

            {f.type === 'select' || f.type === 'radio' ? (
              <View style={styles.optionsWrap}>
                {(f.options ?? []).map((o) => {
                  const active = String(val ?? '') === o.value;
                  return (
                    <TouchableOpacity
                      key={o.value}
                      disabled={disabled}
                      onPress={() => setVal(f.key, o.value)}
                      style={[styles.optBtn, active && styles.optBtnActive]}
                    >
                      <Text style={[styles.optTxt, active && styles.optTxtActive]}>{o.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : f.type === 'multiselect' ? (
              <View style={styles.optionsWrap}>
                {(f.options ?? []).map((o) => {
                  const arr = Array.isArray(val) ? (val as string[]) : [];
                  const active = arr.includes(o.value);
                  return (
                    <TouchableOpacity
                      key={o.value}
                      disabled={disabled}
                      onPress={() => setVal(f.key, active ? arr.filter((x) => x !== o.value) : [...arr, o.value])}
                      style={[styles.optBtn, active && styles.optBtnActive]}
                    >
                      <Text style={[styles.optTxt, active && styles.optTxtActive]}>
                        {active ? '✓ ' : ''}{o.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : f.type === 'date' || f.type === 'datetime' || f.type === 'time' ? (
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={String(val ?? '')}
                  editable={!disabled}
                  onChangeText={(t) => setVal(f.key, t)}
                  placeholder={f.type === 'time' ? 'HH:MM' : 'YYYY-MM-DD'}
                  placeholderTextColor="#64748b"
                />
                <TouchableOpacity
                  onPress={() => {
                    const now = new Date();
                    const v =
                      f.type === 'date'
                        ? now.toISOString().slice(0, 10)
                        : f.type === 'time'
                          ? now.toTimeString().slice(0, 5)
                          : now.toISOString();
                    setVal(f.key, v);
                  }}
                  style={styles.actionBtn}
                >
                  <Text style={styles.actionTxt}>Ahora</Text>
                </TouchableOpacity>
              </View>
            ) : f.type === 'boolean' ? (
              <Switch value={Boolean(val)} disabled={disabled} onValueChange={(v) => setVal(f.key, v)} />
            ) : f.type === 'qr' || f.type === 'barcode' ? (
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={String(val ?? '')}
                  editable={!disabled}
                  onChangeText={(t) => setVal(f.key, t)}
                  placeholder="Código escaneado"
                  placeholderTextColor="#64748b"
                />
                <TouchableOpacity onPress={() => setQrField(f.key)} style={styles.actionBtn}>
                  <Text style={styles.actionTxt}>Escanear</Text>
                </TouchableOpacity>
              </View>
            ) : f.type === 'photo' ? (
              <TouchableOpacity onPress={() => takePhoto(f.key, f.config?.allowGallery !== false)} style={styles.actionBtn}>
                <Text style={styles.actionTxt}>
                  {f.config?.allowGallery === false ? '📷 Tomar Foto (Solo Cámara)' : '📷 Adjuntar Foto'} ({Array.isArray(val) ? val.length : 0})
                </Text>
              </TouchableOpacity>
            ) : f.type === 'file' ? (
              <TouchableOpacity onPress={() => pickFile(f.key)} style={styles.actionBtn}>
                <Text style={styles.actionTxt}>📎 Adjuntar Archivo ({Array.isArray(val) ? val.length : 0})</Text>
              </TouchableOpacity>
            ) : f.type === 'signature' ? (
              <View style={{ gap: 6 }}>
                <TouchableOpacity onPress={() => setSigField(f.key)} style={styles.actionBtn}>
                  <Text style={styles.actionTxt}>✍️ Capturar Firma ({Array.isArray(val) ? val.length : 0})</Text>
                </TouchableOpacity>
                {evidences
                  .filter((e) => e.fieldKey === f.key && e.kind === 'SIGNATURE')
                  .map((ev) => (
                    <SignaturePreviewMobile key={ev.id} note={ev.note} />
                  ))}
              </View>
            ) : f.type === 'audio' ? (
              <TouchableOpacity onPress={() => setAudioField({ key: f.key, isSpeech: false })} style={styles.actionBtn}>
                <Text style={styles.actionTxt}>🎙️ Grabar Audio ({Array.isArray(val) ? val.length : 0})</Text>
              </TouchableOpacity>
            ) : f.type === 'speech' ? (
              <View style={{ gap: 8 }}>
                <TouchableOpacity onPress={() => setAudioField({ key: f.key, isSpeech: true })} style={styles.actionBtn}>
                  <Text style={styles.actionTxt}>🎙️ Grabar Voz / Transcripción</Text>
                </TouchableOpacity>
                <TextInput
                  style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                  multiline
                  editable={!disabled}
                  value={val === undefined || val === null ? '' : String(val)}
                  onChangeText={(t) => setVal(f.key, t)}
                  placeholder="Dictado / transcripción de voz..."
                  placeholderTextColor="#64748b"
                />
              </View>
            ) : f.type === 'geopoint' || f.type === 'geoline' || f.type === 'geopolygon' ? (
              <TouchableOpacity
                onPress={() => {
                  const k = f.type === 'geoline' ? 'LINE' : f.type === 'geopolygon' ? 'POLYGON' : 'POINT';
                  if (onOpenGeoMap) {
                    onOpenGeoMap(k);
                  } else {
                    void captureGps(f.key, k);
                  }
                }}
                style={styles.actionBtn}
              >
                <Text style={styles.actionTxt}>🗺️ Capturar en Mapa ({Array.isArray(val) ? val.length : 0})</Text>
              </TouchableOpacity>
            ) : f.type === 'text' && /ubicaci|direcci|comuna|sector|address/i.test(`${f.key} ${f.label}`) ? (
              <AddressAutocompleteMobile
                editable={!disabled}
                value={val === undefined || val === null ? '' : String(val)}
                onChangeText={(t) => setVal(f.key, t)}
                placeholder={f.placeholder || 'Buscar dirección o comuna...'}
              />
            ) : (
              <TextInput
                style={[styles.input, f.type === 'textarea' && { height: 80, textAlignVertical: 'top' }]}
                multiline={f.type === 'textarea'}
                keyboardType={f.type === 'number' ? 'numeric' : 'default'}
                editable={!disabled}
                value={val === undefined || val === null ? '' : String(val)}
                onChangeText={(t) => setVal(f.key, f.type === 'number' ? (t === '' ? undefined : Number(t)) : t)}
                placeholder={f.placeholder}
                placeholderTextColor="#64748b"
              />
            )}
          </View>
        );
      })}

      <QrScannerModal
        visible={Boolean(qrField)}
        onScanned={(code) => {
          if (qrField) setVal(qrField, code);
          setQrField(null);
        }}
        onClose={() => setQrField(null)}
      />

      <SignatureModal
        visible={Boolean(sigField)}
        onSave={(svg) => {
          if (sigField) {
            const evId = Crypto.randomUUID();
            onCaptureEvidence({ id: evId, kind: 'SIGNATURE', fieldKey: sigField, note: svg, source: 'signature-pad' });
            const cur = Array.isArray(state.values[sigField]) ? (state.values[sigField] as string[]) : [];
            setVal(sigField, [...cur, evId]);
          }
          setSigField(null);
        }}
        onClose={() => setSigField(null)}
      />

      <AudioRecorderModal
        visible={Boolean(audioField)}
        initialTranscript={audioField?.isSpeech && typeof state.values[audioField.key] === 'string' ? String(state.values[audioField.key]) : ''}
        onSave={(res) => {
          if (audioField) {
            const evId = Crypto.randomUUID();
            onCaptureEvidence({
              id: evId,
              kind: 'AUDIO',
              fieldKey: audioField.key,
              fileUri: res.uri,
              fileName: res.fileName,
              mimeType: res.mimeType,
              note: `Duración: ${res.durationSec}s`,
              transcript: res.transcript,
              source: 'recorder',
              lat: res.lat,
              lng: res.lng,
              accuracy: res.accuracy,
            });
            if (audioField.isSpeech) {
              if (res.transcript) setVal(audioField.key, res.transcript);
            } else {
              const cur = Array.isArray(state.values[audioField.key]) ? (state.values[audioField.key] as string[]) : [];
              setVal(audioField.key, [...cur, evId]);
            }
          }
          setAudioField(null);
        }}
        onClose={() => setAudioField(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  section: { borderBottomWidth: 1, borderBottomColor: '#cbd5e1', paddingBottom: 4, marginTop: 8 },
  sectionTxt: { fontSize: 15, fontWeight: '700', color: '#006fb3' },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: '#222222' },
  input: { borderWidth: 1, borderColor: '#d9e2ec', borderRadius: 4, padding: 10, backgroundColor: '#fff', fontSize: 14 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  optionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 4, borderWidth: 1, borderColor: '#d9e2ec', backgroundColor: '#fff' },
  optBtnActive: { backgroundColor: '#006fb3', borderColor: '#006fb3' },
  optTxt: { fontSize: 13, color: '#334155', fontWeight: '600' },
  optTxtActive: { color: '#fff', fontWeight: '700' },
  actionBtn: { backgroundColor: '#006fb3', paddingVertical: 11, paddingHorizontal: 14, borderRadius: 4, alignItems: 'center' },
  actionTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
