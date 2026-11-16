'use client';

import { useRef, useState } from 'react';
import { evaluateForm, type FormDefinition, type FormContext, type FormValues } from '@terreno/shared';

export function DynamicFormRenderer({
  definition,
  values,
  onChange,
  context,
  readOnly = false,
  evidences = [],
  onUploadFieldEvidence,
  onTranscribeAudio,
}: {
  definition: FormDefinition;
  values: FormValues;
  onChange: (next: FormValues) => void;
  context?: FormContext;
  readOnly?: boolean;
  evidences?: { id: string; fieldKey?: string | null; fileName?: string | null; kind: string; transcript?: string | null }[];
  onUploadFieldEvidence?: (
    fieldKey: string,
    kind: 'PHOTO' | 'FILE' | 'AUDIO',
    file: File,
    transcript?: string,
  ) => Promise<string | null>;
  onTranscribeAudio?: (file: File) => Promise<string>;
}) {
  const state = evaluateForm(definition, values, context);
  const [recordingKey, setRecordingKey] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const setField = (key: string, val: unknown) => {
    onChange({ ...state.values, [key]: val });
  };

  const toggleRecording = async (fieldKey: string, isSpeech: boolean) => {
    if (recordingKey === fieldKey && recorderRef.current) {
      recorderRef.current.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecordingKey(null);
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        const ext = (mr.mimeType || '').includes('ogg') ? 'ogg' : 'webm';
        const file = new File([blob], `voz-web-${Date.now()}.${ext}`, { type: blob.type });
        setBusyKey(fieldKey);
        try {
          let transcript = '';
          if (onTranscribeAudio) {
            transcript = await onTranscribeAudio(file).catch(() => '');
          }
          if (onUploadFieldEvidence) {
            const evId = await onUploadFieldEvidence(fieldKey, 'AUDIO', file, transcript || undefined);
            if (!isSpeech && evId) {
              const cur = Array.isArray(state.values[fieldKey]) ? (state.values[fieldKey] as string[]) : [];
              setField(fieldKey, [...cur, evId]);
            }
          }
          if (isSpeech && transcript) {
            setField(fieldKey, transcript);
          }
        } finally {
          setBusyKey(null);
        }
      };
      recorderRef.current = mr;
      mr.start();
      setRecordingKey(fieldKey);
    } catch {
      alert('No se pudo acceder al micrófono del navegador.');
    }
  };

  return (
    <div className="space-y-4">
      {definition.fields.map((f) => {
        if (!state.visible[f.key]) return null;
        if (f.type === 'section') {
          return (
            <div key={f.key} className="pt-4 pb-1 border-b border-slate-200">
              <h3 className="font-semibold text-slate-800 text-base">{f.label}</h3>
              {f.help && <p className="text-xs text-slate-500">{f.help}</p>}
            </div>
          );
        }

        const isDisabled = readOnly || state.disabled[f.key];
        const isReq = state.required[f.key];
        const val = state.values[f.key];

        return (
          <div key={f.key} className="space-y-1">
            <label className="block text-sm font-medium text-slate-700">
              {f.label}
              {isReq && <span className="text-red-600 ml-1">*</span>}
              {f.type === 'photo' && f.config?.allowGallery === false && (
                <span className="ml-2 text-[11px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                  Solo cámara (galería bloqueada)
                </span>
              )}
            </label>
            {f.help && <p className="text-xs text-slate-500">{f.help}</p>}

            {f.type === 'textarea' ? (
              <textarea
                rows={3}
                disabled={isDisabled}
                value={String(val ?? '')}
                placeholder={f.placeholder}
                onChange={(e) => setField(f.key, e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-100"
              />
            ) : f.type === 'speech' ? (
              <div className="space-y-2">
                {!isDisabled && (
                  <button
                    type="button"
                    disabled={busyKey === f.key}
                    onClick={() => void toggleRecording(f.key, true)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white ${
                      recordingKey === f.key ? 'bg-red-600 animate-pulse' : 'bg-[#0b3b60] hover:bg-[#0f4c81]'
                    }`}
                  >
                    {busyKey === f.key
                      ? '⏳ Transcribiendo...'
                      : recordingKey === f.key
                        ? '■ Detener y Transcribir'
                        : '🎙️ Grabar Voz y Transcribir'}
                  </button>
                )}
                <textarea
                  rows={3}
                  disabled={isDisabled}
                  value={String(val ?? '')}
                  placeholder={f.placeholder || 'Dictado / transcripción automática de voz...'}
                  onChange={(e) => setField(f.key, e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-100"
                />
              </div>
            ) : f.type === 'number' ? (
              <input
                type="number"
                disabled={isDisabled}
                value={val === undefined || val === null ? '' : String(val)}
                min={f.config?.min}
                max={f.config?.max}
                onChange={(e) => setField(f.key, e.target.value === '' ? undefined : Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-100"
              />
            ) : f.type === 'date' ? (
              <input
                type="date"
                disabled={isDisabled}
                value={String(val ?? '')}
                onChange={(e) => setField(f.key, e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-100"
              />
            ) : f.type === 'select' || f.type === 'radio' ? (
              <select
                disabled={isDisabled}
                value={String(val ?? '')}
                onChange={(e) => setField(f.key, e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white disabled:bg-slate-100"
              >
                <option value="">-- Seleccione --</option>
                {(f.options ?? []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === 'multiselect' ? (
              <div className="flex flex-wrap gap-2">
                {(f.options ?? []).map((o) => {
                  const arr = Array.isArray(val) ? (val as string[]) : [];
                  const checked = arr.includes(o.value);
                  return (
                    <label key={o.value} className="inline-flex items-center gap-1.5 text-sm bg-slate-100 px-2.5 py-1 rounded-lg cursor-pointer">
                      <input
                        type="checkbox"
                        disabled={isDisabled}
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked ? [...arr, o.value] : arr.filter((x) => x !== o.value);
                          setField(f.key, next);
                        }}
                      />
                      {o.label}
                    </label>
                  );
                })}
              </div>
            ) : f.type === 'boolean' ? (
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={isDisabled}
                  checked={Boolean(val)}
                  onChange={(e) => setField(f.key, e.target.checked)}
                />
                <span>Sí / Conforme</span>
              </label>
            ) : f.type === 'photo' || f.type === 'file' ? (
              <div className="bg-slate-50 border border-dashed border-slate-300 rounded-lg p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-slate-600">
                    {f.type === 'photo' ? '📷 Fotografías adjuntas:' : '📎 Archivos adjuntos:'}{' '}
                    <b>{Array.isArray(val) ? val.length : 0}</b>
                  </span>
                  {!isDisabled && onUploadFieldEvidence && (
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#146c43] hover:bg-[#0f5434] text-white rounded-lg text-xs font-semibold cursor-pointer">
                      {busyKey === f.key ? 'Subiendo...' : f.type === 'photo' ? '📷 Adjuntar Foto' : '📎 Adjuntar Archivo'}
                      <input
                        type="file"
                        accept={f.type === 'photo' ? 'image/*' : undefined}
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (!file) return;
                          setBusyKey(f.key);
                          try {
                            const evId = await onUploadFieldEvidence(f.key, f.type === 'photo' ? 'PHOTO' : 'FILE', file);
                            if (evId) {
                              const cur = Array.isArray(val) ? (val as string[]) : [];
                              setField(f.key, [...cur, evId]);
                            }
                          } finally {
                            setBusyKey(null);
                          }
                        }}
                      />
                    </label>
                  )}
                </div>
                {evidences.filter((e) => e.fieldKey === f.key).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {evidences
                      .filter((e) => e.fieldKey === f.key)
                      .map((ev) => (
                        <span key={ev.id} className="text-[11px] bg-white border border-slate-200 rounded px-2 py-0.5 text-slate-700">
                          {ev.kind === 'PHOTO' ? '🖼️' : '📄'} {ev.fileName || ev.id.slice(0, 8)}
                        </span>
                      ))}
                  </div>
                )}
              </div>
            ) : f.type === 'audio' ? (
              <div className="bg-slate-50 border border-dashed border-slate-300 rounded-lg p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-slate-600">
                    🎙️ Notas de voz adjuntas: <b>{Array.isArray(val) ? val.length : 0}</b>
                  </span>
                  {!isDisabled && (
                    <button
                      type="button"
                      disabled={busyKey === f.key}
                      onClick={() => void toggleRecording(f.key, false)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white ${
                        recordingKey === f.key ? 'bg-red-600 animate-pulse' : 'bg-[#0b3b60] hover:bg-[#0f4c81]'
                      }`}
                    >
                      {busyKey === f.key
                        ? '⏳ Transcribiendo...'
                        : recordingKey === f.key
                          ? '■ Detener Grabación'
                          : '🎙️ Grabar Audio'}
                    </button>
                  )}
                </div>
                {evidences.filter((e) => e.fieldKey === f.key).length > 0 && (
                  <div className="space-y-1">
                    {evidences
                      .filter((e) => e.fieldKey === f.key)
                      .map((ev) => (
                        <div key={ev.id} className="text-[11px] bg-white border border-slate-200 rounded px-2 py-1 text-slate-700">
                          🎙️ <b>{ev.fileName || ev.id.slice(0, 8)}</b>
                          {ev.transcript ? ` — “${ev.transcript}”` : ''}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            ) : f.type === 'signature' ? (
              <div className="text-xs text-slate-500 bg-slate-50 border border-dashed border-slate-300 rounded-lg p-3">
                Campo de firma digital. Firmas registradas: {Array.isArray(val) ? val.length : 0}. Capture la firma desde la app móvil.
              </div>
            ) : (
              <input
                type="text"
                disabled={isDisabled}
                value={String(val ?? '')}
                placeholder={f.placeholder}
                onChange={(e) => setField(f.key, e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-100"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
