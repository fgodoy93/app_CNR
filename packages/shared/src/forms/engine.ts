import {
  EVIDENCE_FIELD_TYPES,
  GEO_FIELD_TYPES,
  type Condition,
  type FormDefinition,
  type FormField,
  type RuleAction,
} from './schema';

export type FormValues = Record<string, unknown>;

export interface FormContext {
  activity?: Record<string, unknown>;
  user?: Record<string, unknown>;
  /** connector key -> response object */
  connectors?: Record<string, unknown>;
}

export interface FormState {
  values: FormValues;
  visible: Record<string, boolean>;
  required: Record<string, boolean>;
  disabled: Record<string, boolean>;
}

const MAX_PASSES = 10;

export function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function looseEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) return false;
  if (typeof a === 'boolean' || typeof b === 'boolean') return String(a) === String(b);
  return String(a) === String(b);
}

function toNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function compare(a: unknown, b: unknown): number | undefined {
  const na = toNumber(a);
  const nb = toNumber(b);
  if (na !== undefined && nb !== undefined) return na - nb;
  if (typeof a === 'string' && typeof b === 'string' && a !== '' && b !== '') return a.localeCompare(b);
  return undefined;
}

export function evaluateCondition(cond: Condition, values: FormValues): boolean {
  if ('all' in cond) return cond.all.every((c) => evaluateCondition(c, values));
  if ('any' in cond) return cond.any.some((c) => evaluateCondition(c, values));
  if ('not' in cond) return !evaluateCondition(cond.not, values);
  const actual = values[cond.field];
  const expected = cond.value;
  switch (cond.op) {
    case 'eq':
      return Array.isArray(actual) ? actual.some((x) => looseEquals(x, expected)) : looseEquals(actual, expected);
    case 'neq':
      return !(Array.isArray(actual) ? actual.some((x) => looseEquals(x, expected)) : looseEquals(actual, expected));
    case 'gt': {
      const c = compare(actual, expected);
      return c !== undefined && c > 0;
    }
    case 'gte': {
      const c = compare(actual, expected);
      return c !== undefined && c >= 0;
    }
    case 'lt': {
      const c = compare(actual, expected);
      return c !== undefined && c < 0;
    }
    case 'lte': {
      const c = compare(actual, expected);
      return c !== undefined && c <= 0;
    }
    case 'in':
      return Array.isArray(expected) && expected.some((e) => looseEquals(actual, e));
    case 'nin':
      return !(Array.isArray(expected) && expected.some((e) => looseEquals(actual, e)));
    case 'contains':
      if (Array.isArray(actual)) return actual.some((x) => looseEquals(x, expected));
      if (typeof actual === 'string') return expected !== undefined && actual.toLowerCase().includes(String(expected).toLowerCase());
      return false;
    case 'empty':
      return isEmptyValue(actual);
    case 'notEmpty':
      return !isEmptyValue(actual);
    default:
      return false;
  }
}

function resolvePrefill(field: FormField, ctx: FormContext): unknown {
  const p = field.prefill;
  if (!p) return undefined;
  if (p.source === 'activity') return getPath(ctx.activity, p.path);
  if (p.source === 'user') return getPath(ctx.user, p.path);
  if (p.source === 'connector' && p.connector) return getPath(ctx.connectors?.[p.connector], p.path);
  return undefined;
}

function applyAction(a: RuleAction, s: FormState): void {
  switch (a.action) {
    case 'show':
      s.visible[a.target] = true;
      break;
    case 'hide':
      s.visible[a.target] = false;
      break;
    case 'require':
      s.required[a.target] = true;
      break;
    case 'optional':
      s.required[a.target] = false;
      break;
    case 'enable':
      s.disabled[a.target] = false;
      break;
    case 'disable':
      s.disabled[a.target] = true;
      break;
    case 'set':
      s.values[a.target] = a.fromField !== undefined ? s.values[a.fromField] : a.value;
      break;
  }
}

/**
 * Computes the effective state of a form (visibility, required flags, autofilled values)
 * from the definition, the user values and the context used for prefill.
 * Rules run until values stabilise so that chained rules (set -> show) work regardless of order.
 */
export function evaluateForm(def: FormDefinition, input: FormValues, ctx: FormContext = {}): FormState {
  const base: FormValues = { ...input };
  const lockedPrefill: Record<string, boolean> = {};
  for (const f of def.fields) {
    if (base[f.key] === undefined && f.defaultValue !== undefined) base[f.key] = f.defaultValue;
    if (f.prefill) {
      const pv = resolvePrefill(f, ctx);
      if (pv !== undefined && (f.prefill.locked || isEmptyValue(base[f.key]))) base[f.key] = pv;
      if (f.prefill.locked) lockedPrefill[f.key] = true;
    }
  }

  let state: FormState = { values: base, visible: {}, required: {}, disabled: {} };
  let previous = '';
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const s: FormState = { values: { ...state.values }, visible: {}, required: {}, disabled: {} };
    for (const f of def.fields) {
      s.visible[f.key] = !f.hidden;
      s.required[f.key] = Boolean(f.required);
      s.disabled[f.key] = Boolean(f.readOnly) || Boolean(lockedPrefill[f.key]);
    }
    for (const rule of def.rules ?? []) {
      const actions = evaluateCondition(rule.when, s.values) ? rule.then : (rule.otherwise ?? []);
      actions.forEach((a) => applyAction(a, s));
    }
    state = s;
    const snapshot = JSON.stringify([s.values, s.visible]);
    if (snapshot === previous) break;
    previous = snapshot;
  }
  return state;
}

export type FormErrors = Record<string, string>;

/** Validates values against the form definition, honouring conditional visibility/required rules. */
export function validateFormValues(def: FormDefinition, input: FormValues, ctx: FormContext = {}): FormErrors {
  const state = evaluateForm(def, input, ctx);
  const errors: FormErrors = {};
  for (const f of def.fields) {
    if (f.type === 'section' || !state.visible[f.key]) continue;
    const v = state.values[f.key];
    if (isEmptyValue(v)) {
      if (state.required[f.key]) errors[f.key] = `${f.label}: campo obligatorio`;
      continue;
    }
    const err = validateFieldValue(f, v);
    if (err) errors[f.key] = `${f.label}: ${err}`;
  }
  return errors;
}

function validateFieldValue(f: FormField, v: unknown): string | undefined {
  const cfg = f.config ?? {};
  switch (f.type) {
    case 'number': {
      const n = toNumber(v);
      if (n === undefined) return 'debe ser un número';
      if (cfg.min !== undefined && n < cfg.min) return `valor mínimo ${cfg.min}`;
      if (cfg.max !== undefined && n > cfg.max) return `valor máximo ${cfg.max}`;
      return undefined;
    }
    case 'text':
    case 'textarea':
    case 'speech':
    case 'qr':
    case 'barcode':
      if (typeof v !== 'string') return 'debe ser texto';
      if (cfg.maxLength !== undefined && v.length > cfg.maxLength) return `máximo ${cfg.maxLength} caracteres`;
      return undefined;
    case 'date':
    case 'datetime':
      return typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? undefined : 'fecha inválida';
    case 'time':
      return typeof v === 'string' && /^\d{2}:\d{2}(:\d{2})?$/.test(v) ? undefined : 'hora inválida (HH:MM)';
    case 'select':
    case 'radio':
      return f.options?.some((o) => o.value === String(v)) ? undefined : 'opción no válida';
    case 'multiselect': {
      if (!Array.isArray(v)) return 'debe ser una lista';
      const allowed = new Set(f.options?.map((o) => o.value));
      return v.every((x) => allowed.has(String(x))) ? undefined : 'contiene una opción no válida';
    }
    case 'boolean':
      return typeof v === 'boolean' ? undefined : 'debe ser sí o no';
    default:
      if (EVIDENCE_FIELD_TYPES.includes(f.type) || GEO_FIELD_TYPES.includes(f.type)) {
        if (!Array.isArray(v)) return 'formato inválido';
        if (cfg.maxFiles !== undefined && v.length > cfg.maxFiles) return `máximo ${cfg.maxFiles} elementos`;
      }
      return undefined;
  }
}
