'use client';

import { evaluateForm, type FormDefinition, type FormContext, type FormValues } from '@terreno/shared';

export function DynamicFormRenderer({
  definition,
  values,
  onChange,
  context,
  readOnly = false,
}: {
  definition: FormDefinition;
  values: FormValues;
  onChange: (next: FormValues) => void;
  context?: FormContext;
  readOnly?: boolean;
}) {
  const state = evaluateForm(definition, values, context);

  const setField = (key: string, val: unknown) => {
    onChange({ ...state.values, [key]: val });
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

            {f.type === 'textarea' || f.type === 'speech' ? (
              <textarea
                rows={3}
                disabled={isDisabled}
                value={String(val ?? '')}
                placeholder={f.placeholder}
                onChange={(e) => setField(f.key, e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-100"
              />
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
            ) : f.type === 'photo' || f.type === 'file' || f.type === 'signature' || f.type === 'audio' ? (
              <div className="text-xs text-slate-500 bg-slate-50 border border-dashed border-slate-300 rounded-lg p-3">
                Campo de captura ({f.type}). Elementos adjuntos: {Array.isArray(val) ? val.length : 0}. Suba evidencias en la sección inferior o desde la app móvil.
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
