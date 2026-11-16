import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import * as Location from 'expo-location';
import { apiFetch, getApiUrl, getToken } from '../api/client';
import { COLORS } from '../theme';

export interface RecordedAudioResult {
  uri: string;
  fileName: string;
  mimeType: string;
  durationSec: number;
  transcript?: string;
  lat?: number;
  lng?: number;
  accuracy?: number;
}

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function uploadAudioForTranscription(url: string, token: string | null, uri: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('file', {
      uri,
      name: `voz-${Date.now()}.m4a`,
      type: 'audio/mp4',
    } as any);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const parsed = JSON.parse(xhr.responseText) as { text?: string };
          resolve((parsed.text || '').trim());
        } catch {
          reject(new Error('Respuesta inválida'));
        }
      } else {
        reject(new Error(`HTTP ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('Sin conexión'));
    xhr.send(fd as any);
  });
}

export function AudioRecorderModal({
  visible,
  initialTranscript = '',
  requireTranscript = false,
  onSave,
  onClose,
}: {
  visible: boolean;
  initialTranscript?: string;
  requireTranscript?: boolean;
  onSave: (result: RecordedAudioResult) => void;
  onClose: () => void;
}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recState = useAudioRecorderState(recorder);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [durationSec, setDurationSec] = useState(0);
  const [transcript, setTranscript] = useState(initialTranscript);
  const [transcribing, setTranscribing] = useState(false);
  const [sttStatus, setSttStatus] = useState<string | null>(null);

  const player = useAudioPlayer(recordedUri ? { uri: recordedUri } : null);
  const playerStatus = useAudioPlayerStatus(player);

  useEffect(() => {
    if (visible) {
      setRecordedUri(null);
      setDurationSec(0);
      setTranscript(initialTranscript);
      setTranscribing(false);
      setSttStatus(null);
    }
  }, [visible, initialTranscript]);

  const runTranscription = async (uri: string) => {
    setTranscribing(true);
    setSttStatus('Transcribiendo audio automáticamente...');
    try {
      await apiFetch('/api/v1/auth/me').catch(() => undefined);
      const base = await getApiUrl();
      const token = await getToken();
      const text = await uploadAudioForTranscription(`${base}/api/v1/evidences/transcribe`, token, uri);
      if (text) {
        setTranscript(text);
        setSttStatus('✓ Transcripción completada');
      } else {
        setSttStatus('No se detectó voz clara en el audio.');
      }
    } catch {
      setSttStatus('Sin conexión al servidor: el audio se transcribirá automáticamente al sincronizar.');
    } finally {
      setTranscribing(false);
    }
  };

  const startRecording = async () => {
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permiso requerido', 'Debe autorizar el uso del micrófono para grabar notas de voz.');
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    setRecordedUri(null);
    setSttStatus(null);
    await recorder.prepareToRecordAsync();
    recorder.record();
  };

  const stopRecording = async () => {
    const sec = Math.max(1, Math.round((recState.durationMillis || 0) / 1000));
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    if (recorder.uri) {
      setRecordedUri(recorder.uri);
      setDurationSec(sec);
      void runTranscription(recorder.uri);
    }
  };

  const handleSave = async () => {
    if (!recordedUri) {
      return Alert.alert('Sin grabación', 'Presione Grabar para registrar el audio antes de guardar.');
    }
    if (requireTranscript && !transcript.trim()) {
      return Alert.alert('Transcripción vacía', 'Ingrese o dicte la transcripción con el micrófono del teclado.');
    }
    const loc = await Location.getLastKnownPositionAsync().catch(() => null);
    onSave({
      uri: recordedUri,
      fileName: `voz-${Date.now()}.m4a`,
      mimeType: 'audio/mp4',
      durationSec,
      transcript: transcript.trim() || undefined,
      lat: loc?.coords.latitude,
      lng: loc?.coords.longitude,
      accuracy: loc?.coords.accuracy ?? undefined,
    });
  };

  const handleCancel = async () => {
    if (recState.isRecording) {
      await recorder.stop().catch(() => undefined);
    }
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>🎙️ Grabación de Voz en Terreno</Text>
          <Text style={styles.sub}>
            Grabe su nota de voz (funciona sin conexión) y opcionalmente agregue o dicte la transcripción.
          </Text>

          <View style={styles.timerBox}>
            <Text style={[styles.timer, recState.isRecording && { color: COLORS.danger }]}>
              {recState.isRecording ? `● ${formatDuration(recState.durationMillis)}` : formatDuration(durationSec * 1000)}
            </Text>
            <Text style={styles.meta}>
              {recState.isRecording
                ? 'Grabando audio...'
                : recordedUri
                  ? 'Grabación lista para pre-escuchar o guardar'
                  : 'Listo para grabar'}
            </Text>
          </View>

          <View style={styles.row}>
            {!recState.isRecording ? (
              <TouchableOpacity onPress={startRecording} style={[styles.btn, { backgroundColor: COLORS.danger }]}>
                <Text style={styles.btnTxt}>{recordedUri ? '🔄 Regrabar' : '● Grabar'}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={stopRecording} style={[styles.btn, { backgroundColor: COLORS.primary }]}>
                <Text style={styles.btnTxt}>■ Detener</Text>
              </TouchableOpacity>
            )}

            {recordedUri && !recState.isRecording && (
              <TouchableOpacity
                onPress={() => (playerStatus.playing ? player.pause() : player.play())}
                style={[styles.btn, { backgroundColor: COLORS.water }]}
              >
                <Text style={styles.btnTxt}>{playerStatus.playing ? '⏸ Pausar' : '▶ Escuchar'}</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, marginBottom: 6 }}>
            <Text style={[styles.label, { marginTop: 0, marginBottom: 0 }]}>Transcripción automática (editable)</Text>
            {recordedUri && !recState.isRecording && !transcribing && (
              <TouchableOpacity onPress={() => runTranscription(recordedUri)}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.water }}>🔄 Re-transcribir</Text>
              </TouchableOpacity>
            )}
          </View>
          {transcribing && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={{ fontSize: 12, color: COLORS.primary, fontWeight: '600' }}>Convirtiendo voz a texto...</Text>
            </View>
          )}
          {!transcribing && sttStatus && (
            <Text style={{ fontSize: 11, color: sttStatus.startsWith('✓') ? COLORS.green : COLORS.muted, marginBottom: 6 }}>
              {sttStatus}
            </Text>
          )}
          <TextInput
            style={styles.input}
            multiline
            value={transcript}
            onChangeText={setTranscript}
            placeholder="El texto aparecerá aquí automáticamente al detener la grabación..."
          />

          <View style={[styles.row, { marginTop: 14 }]}>
            <TouchableOpacity onPress={handleCancel} style={[styles.btn, { backgroundColor: '#e2e8f0' }]}>
              <Text style={[styles.btnTxt, { color: COLORS.text }]}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} style={[styles.btn, { backgroundColor: COLORS.green }]}>
              <Text style={styles.btnTxt}>Guardar Audio</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', padding: 18 },
  sheet: { backgroundColor: '#fff', borderRadius: 16, padding: 18 },
  title: { fontSize: 16, fontWeight: '800', color: COLORS.primary },
  sub: { fontSize: 12, color: COLORS.muted, marginTop: 4 },
  timerBox: {
    marginVertical: 14,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  timer: { fontSize: 28, fontWeight: '800', color: COLORS.primary, fontVariant: ['tabular-nums'] },
  meta: { fontSize: 11, color: COLORS.muted, marginTop: 4 },
  row: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  btnTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  label: { fontSize: 12, fontWeight: '700', color: COLORS.primary, marginTop: 14, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 10,
    minHeight: 74,
    textAlignVertical: 'top',
    fontSize: 13,
    backgroundColor: '#fff',
  },
});
