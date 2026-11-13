import { describe, expect, it } from 'vitest';
import { evaluateCondition, evaluateForm, validateFormValues } from './engine';
import type { FormDefinition } from './schema';

const def: FormDefinition = {
  fields: [
    { key: 'estado_obra', type: 'select', label: 'Estado', required: true, options: [
      { value: 'ok', label: 'Conforme' },
      { value: 'obs', label: 'Con observaciones' },
    ] },
    { key: 'observaciones', type: 'textarea', label: 'Observaciones', hidden: true },
    { key: 'foto_obs', type: 'photo', label: 'Foto observación', hidden: true, config: { allowGallery: false } },
    { key: 'caudal', type: 'number', label: 'Caudal (l/s)', config: { min: 0, max: 1000 } },
    { key: 'nivel_riesgo', type: 'text', label: 'Riesgo', readOnly: true },
    { key: 'rol', type: 'text', label: 'Rol', prefill: { source: 'activity', path: 'externalData.rol', locked: true } },
    { key: 'inspector', type: 'text', label: 'Inspector', prefill: { source: 'user', path: 'name' } },
  ],
  rules: [
    {
      when: { field: 'estado_obra', op: 'eq', value: 'obs' },
      then: [
        { action: 'show', target: 'observaciones' },
        { action: 'require', target: 'observaciones' },
        { action: 'show', target: 'foto_obs' },
        { action: 'require', target: 'foto_obs' },
      ],
    },
    {
      when: { field: 'caudal', op: 'gt', value: 500 },
      then: [{ action: 'set', target: 'nivel_riesgo', value: 'ALTO' }],
      otherwise: [{ action: 'set', target: 'nivel_riesgo', value: 'NORMAL' }],
    },
  ],
};

describe('evaluateCondition', () => {
  const v = { a: 5, b: 'x', c: ['p', 'q'], d: '', e: null };
  it.each([
    [{ field: 'a', op: 'eq', value: 5 }, true],
    [{ field: 'a', op: 'eq', value: '5' }, true],
    [{ field: 'a', op: 'neq', value: 5 }, false],
    [{ field: 'a', op: 'gt', value: 4 }, true],
    [{ field: 'a', op: 'gte', value: 5 }, true],
    [{ field: 'a', op: 'lt', value: 5 }, false],
    [{ field: 'a', op: 'lte', value: 5 }, true],
    [{ field: 'b', op: 'in', value: ['x', 'y'] }, true],
    [{ field: 'b', op: 'nin', value: ['x', 'y'] }, false],
    [{ field: 'c', op: 'contains', value: 'q' }, true],
    [{ field: 'b', op: 'contains', value: 'x' }, true],
    [{ field: 'd', op: 'empty' }, true],
    [{ field: 'e', op: 'empty' }, true],
    [{ field: 'zz', op: 'empty' }, true],
    [{ field: 'c', op: 'notEmpty' }, true],
    [{ field: 'zz', op: 'gt', value: 1 }, false],
  ] as const)('%j -> %s', (cond, expected) => {
    expect(evaluateCondition(cond as never, v)).toBe(expected);
  });

  it('supports all / any / not', () => {
    expect(evaluateCondition({ all: [{ field: 'a', op: 'eq', value: 5 }, { field: 'b', op: 'eq', value: 'x' }] }, v)).toBe(true);
    expect(evaluateCondition({ any: [{ field: 'a', op: 'eq', value: 1 }, { field: 'b', op: 'eq', value: 'x' }] }, v)).toBe(true);
    expect(evaluateCondition({ not: { field: 'a', op: 'eq', value: 5 } }, v)).toBe(false);
  });
});

describe('evaluateForm', () => {
  it('hides conditional fields by default', () => {
    const r = evaluateForm(def, { estado_obra: 'ok' });
    expect(r.visible.observaciones).toBe(false);
    expect(r.required.observaciones).toBe(false);
    expect(r.visible.estado_obra).toBe(true);
  });

  it('shows and requires fields when the condition matches', () => {
    const r = evaluateForm(def, { estado_obra: 'obs' });
    expect(r.visible.observaciones).toBe(true);
    expect(r.required.observaciones).toBe(true);
    expect(r.visible.foto_obs).toBe(true);
  });

  it('autofills values with set / otherwise', () => {
    expect(evaluateForm(def, { caudal: 800 }).values.nivel_riesgo).toBe('ALTO');
    expect(evaluateForm(def, { caudal: 10 }).values.nivel_riesgo).toBe('NORMAL');
  });

  it('applies prefill from context without overwriting user values', () => {
    const ctx = { activity: { externalData: { rol: '123-45' } }, user: { name: 'Ana' } };
    const r = evaluateForm(def, {}, ctx);
    expect(r.values.rol).toBe('123-45');
    expect(r.values.inspector).toBe('Ana');
    expect(r.disabled.rol).toBe(true);
    const r2 = evaluateForm(def, { inspector: 'Pedro' }, ctx);
    expect(r2.values.inspector).toBe('Pedro');
  });

  it('locked prefill always wins over user input', () => {
    const ctx = { activity: { externalData: { rol: '123-45' } } };
    expect(evaluateForm(def, { rol: 'hack' }, ctx).values.rol).toBe('123-45');
  });

  it('supports chained rules (set then show)', () => {
    const chained: FormDefinition = {
      fields: [
        { key: 'a', type: 'number', label: 'A' },
        { key: 'b', type: 'text', label: 'B' },
        { key: 'c', type: 'text', label: 'C', hidden: true },
      ],
      rules: [
        { when: { field: 'b', op: 'eq', value: 'X' }, then: [{ action: 'show', target: 'c' }] },
        { when: { field: 'a', op: 'gt', value: 1 }, then: [{ action: 'set', target: 'b', value: 'X' }] },
      ],
    };
    expect(evaluateForm(chained, { a: 2 }).visible.c).toBe(true);
  });

  it('copies values with fromField', () => {
    const d: FormDefinition = {
      fields: [
        { key: 'a', type: 'text', label: 'A' },
        { key: 'b', type: 'text', label: 'B' },
      ],
      rules: [{ when: { field: 'a', op: 'notEmpty' }, then: [{ action: 'set', target: 'b', fromField: 'a' }] }],
    };
    expect(evaluateForm(d, { a: 'hola' }).values.b).toBe('hola');
  });
});

describe('validateFormValues', () => {
  it('reports missing required fields', () => {
    const errors = validateFormValues(def, {});
    expect(errors.estado_obra).toBeDefined();
  });

  it('reports conditional required fields only when visible', () => {
    expect(validateFormValues(def, { estado_obra: 'ok' }).observaciones).toBeUndefined();
    const e = validateFormValues(def, { estado_obra: 'obs' });
    expect(e.observaciones).toBeDefined();
    expect(e.foto_obs).toBeDefined();
  });

  it('validates number ranges and option membership', () => {
    const e = validateFormValues(def, { estado_obra: 'zzz', caudal: 2000 });
    expect(e.estado_obra).toMatch(/opción/i);
    expect(e.caudal).toMatch(/máximo/i);
  });

  it('passes a complete valid submission', () => {
    const e = validateFormValues(def, {
      estado_obra: 'obs',
      observaciones: 'Fisura',
      foto_obs: ['ev-1'],
      caudal: 12,
    });
    expect(e).toEqual({});
  });

  it('ignores hidden fields values', () => {
    expect(validateFormValues(def, { estado_obra: 'ok', caudal: -5 }).caudal).toMatch(/mínimo/i);
  });
});
