'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { api } from '@/lib/api';
import { FIELD_TYPES, FIELD_TYPE_LABELS, type FieldType, type FormField, type FormRule } from '@terreno/shared';
import { Plus, Trash2, UploadCloud, Save } from 'lucide-react';

export default function FormulariosPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [fields, setFields] = useState<FormField[]>([]);
  const [rules, setRules] = useState<FormRule[]>([]);
  const [newForm, setNewForm] = useState({ key: '', name: '', description: '' });
  const [showNew, setShowNew] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api.get<{ data: any[] }>('/api/v1/forms').then((r) => setTemplates(r.data)).catch((e) => setError(e.message));
  };

  useEffect(() => {
    load();
  }, []);

  const selectTemplate = async (id: string) => {
    setError(null);
    setMsg(null);
    const full = await api.get<any>(`/api/v1/forms/${id}`);
    setSelected(full);
    const latest = full.versions?.[0]?.definition ?? full.draft ?? { fields: [], rules: [] };
    setFields(latest.fields ?? []);
    setRules(latest.rules ?? []);
  };

  const addField = () => {
    const idx = fields.length + 1;
    setFields([...fields, { key: `campo_${idx}`, type: 'text', label: `Nuevo Campo ${idx}`, required: false }]);
  };

  const addRule = () => {
    if (fields.length < 2) return;
    setRules([
      ...rules,
      {
        when: { field: fields[0]!.key, op: 'notEmpty' },
        then: [{ action: 'show', target: fields[1]!.key }],
      },
    ]);
  };

  const saveAndPublish = async (publish: boolean) => {
    if (!selected) return;
    setError(null);
    setMsg(null);
    try {
      const def = { fields, rules };
      if (publish) {
        await api.post(`/api/v1/forms/${selected.id}/publish`, { definition: def });
        setMsg('Nueva versión publicada correctamente.');
      } else {
        await api.patch(`/api/v1/forms/${selected.id}`, { definition: def });
        setMsg('Borrador guardado.');
      }
      load();
      selectTemplate(selected.id);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const createForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const created = await api.post<any>('/api/v1/forms', {
        key: newForm.key,
        name: newForm.name,
        description: newForm.description,
        definition: {
          fields: [{ key: 'observacion_general', type: 'textarea', label: 'Observaciones Generales', required: true }],
          rules: [],
        },
      });
      setShowNew(false);
      setNewForm({ key: '', name: '', description: '' });
      load();
      selectTemplate(created.id);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <AppShell title="Constructor de Formularios Personalizados">
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}
      {msg && <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-sm">{msg}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* List */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-slate-800">Plantillas</h3>
            <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-[#0f4c81] text-white rounded-lg text-xs font-medium">
              <Plus className="w-3.5 h-3.5" /> Nueva
            </button>
          </div>
          <div className="space-y-2">
            {templates.map((t) => (
              <div
                key={t.id}
                onClick={() => selectTemplate(t.id)}
                className={`p-3 rounded-lg border cursor-pointer text-sm ${
                  selected?.id === t.id ? 'border-blue-600 bg-blue-50/60' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="font-semibold text-slate-800">{t.name}</div>
                <div className="text-xs text-slate-500">Clave: {t.key} · Versión {t.currentVersion}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Editor */}
        <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          {!selected ? (
            <div className="py-12 text-center text-slate-400 text-sm">Seleccione una plantilla para editar sus campos y reglas condicionales.</div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap justify-between items-center gap-2 border-b pb-4">
                <div>
                  <h3 className="font-bold text-lg text-slate-800">{selected.name}</h3>
                  <p className="text-xs text-slate-500">Versión publicada actual: v{selected.currentVersion}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => saveAndPublish(false)} className="inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm">
                    <Save className="w-4 h-4" /> Guardar borrador
                  </button>
                  <button onClick={() => saveAndPublish(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 text-white rounded-lg text-sm">
                    <UploadCloud className="w-4 h-4" /> Publicar versión
                  </button>
                </div>
              </div>

              {/* Fields */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="font-semibold text-sm text-slate-700">Campos del Formulario ({fields.length})</h4>
                  <button onClick={addField} className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline">
                    <Plus className="w-3.5 h-3.5" /> Agregar campo
                  </button>
                </div>

                {fields.map((f, idx) => (
                  <div key={idx} className="p-3 border border-slate-200 rounded-lg bg-slate-50/50 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                    <input
                      value={f.key}
                      onChange={(e) => {
                        const next = [...fields];
                        next[idx] = { ...f, key: e.target.value };
                        setFields(next);
                      }}
                      placeholder="clave_campo"
                      className="sm:col-span-3 px-2 py-1.5 border rounded text-xs font-mono bg-white"
                    />
                    <input
                      value={f.label}
                      onChange={(e) => {
                        const next = [...fields];
                        next[idx] = { ...f, label: e.target.value };
                        setFields(next);
                      }}
                      placeholder="Etiqueta visible"
                      className="sm:col-span-4 px-2 py-1.5 border rounded text-xs bg-white"
                    />
                    <select
                      value={f.type}
                      onChange={(e) => {
                        const next = [...fields];
                        const type = e.target.value as FieldType;
                        next[idx] = {
                          ...f,
                          type,
                          ...(['select', 'multiselect', 'radio'].includes(type) && !f.options
                            ? { options: [{ value: 'opcion_1', label: 'Opción 1' }] }
                            : {}),
                        };
                        setFields(next);
                      }}
                      className="sm:col-span-3 px-2 py-1.5 border rounded text-xs bg-white"
                    >
                      {FIELD_TYPES.map((t) => (
                        <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>
                      ))}
                    </select>
                    <div className="sm:col-span-2 flex items-center justify-end gap-2">
                      <label className="text-xs flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={Boolean(f.required)}
                          onChange={(e) => {
                            const next = [...fields];
                            next[idx] = { ...f, required: e.target.checked };
                            setFields(next);
                          }}
                        />
                        Req.
                      </label>
                      {f.type === 'photo' && (
                        <label className="text-[11px] flex items-center gap-1" title="Bloquear galería">
                          <input
                            type="checkbox"
                            checked={f.config?.allowGallery === false}
                            onChange={(e) => {
                              const next = [...fields];
                              next[idx] = { ...f, config: { ...f.config, allowGallery: !e.target.checked } };
                              setFields(next);
                            }}
                          />
                          Solo Cám.
                        </label>
                      )}
                      <button onClick={() => setFields(fields.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-700">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Conditional Rules */}
              <div className="space-y-2 pt-3 border-t">
                <div className="flex justify-between items-center">
                  <h4 className="font-semibold text-sm text-slate-700">Reglas Condicionales ({rules.length})</h4>
                  <button onClick={addRule} className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline">
                    <Plus className="w-3.5 h-3.5" /> Agregar regla
                  </button>
                </div>
                {rules.map((r, i) => (
                  <div key={i} className="p-2.5 border rounded-lg text-xs flex justify-between items-center bg-slate-50">
                    <span className="font-mono">{JSON.stringify(r)}</span>
                    <button onClick={() => setRules(rules.filter((_, idx) => idx !== i))} className="text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showNew && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <form onSubmit={createForm} className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-bold text-lg">Nueva Plantilla de Formulario</h3>
            <input value={newForm.key} onChange={(e) => setNewForm({ ...newForm, key: e.target.value })} placeholder="clave_unica (ej. visita_tecnica)" className="w-full px-3 py-2 border rounded-lg text-sm" required />
            <input value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} placeholder="Nombre del formulario" className="w-full px-3 py-2 border rounded-lg text-sm" required />
            <textarea value={newForm.description} onChange={(e) => setNewForm({ ...newForm, description: e.target.value })} placeholder="Descripción" className="w-full px-3 py-2 border rounded-lg text-sm" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowNew(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
              <button type="submit" className="px-4 py-2 bg-[#0f4c81] text-white rounded-lg text-sm">Crear</button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
