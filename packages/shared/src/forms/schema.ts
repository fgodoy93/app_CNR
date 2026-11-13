import { z } from 'zod';

export const FIELD_TYPES = [
  'section',
  'text',
  'textarea',
  'number',
  'date',
  'datetime',
  'time',
  'select',
  'multiselect',
  'radio',
  'boolean',
  'qr',
  'barcode',
  'photo',
  'file',
  'signature',
  'geopoint',
  'geoline',
  'geopolygon',
  'audio',
  'speech',
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  section: 'Sección / título',
  text: 'Texto corto',
  textarea: 'Texto largo',
  number: 'Número',
  date: 'Fecha',
  datetime: 'Fecha y hora',
  time: 'Hora',
  select: 'Lista desplegable',
  multiselect: 'Selección múltiple',
  radio: 'Opción única',
  boolean: 'Sí / No',
  qr: 'Lectura código QR',
  barcode: 'Lectura código de barras',
  photo: 'Fotografía',
  file: 'Archivo adjunto',
  signature: 'Firma',
  geopoint: 'Punto GPS',
  geoline: 'Línea / recorrido GPS',
  geopolygon: 'Polígono GPS',
  audio: 'Grabación de voz',
  speech: 'Voz a texto (transcripción)',
};

/** Field types whose value is a list of evidence ids (binary attachments). */
export const EVIDENCE_FIELD_TYPES: readonly FieldType[] = ['photo', 'file', 'signature', 'audio'];
/** Field types whose value is a list of geo feature ids. */
export const GEO_FIELD_TYPES: readonly FieldType[] = ['geopoint', 'geoline', 'geopolygon'];
export const OPTION_FIELD_TYPES: readonly FieldType[] = ['select', 'multiselect', 'radio'];

export const fieldOptionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
});

export const fieldConfigSchema = z
  .object({
    /** photo: when false the app only allows the camera (gallery blocked). */
    allowGallery: z.boolean().optional(),
    maxFiles: z.number().int().positive().optional(),
    accept: z.array(z.string()).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    decimals: z.number().int().min(0).max(8).optional(),
    maxLength: z.number().int().positive().optional(),
    /** geo*: minimum accuracy in meters required to accept a capture. */
    minAccuracy: z.number().positive().optional(),
    /** geo*: allow several features in one field. */
    multiple: z.boolean().optional(),
    /** audio/speech: language for transcription. */
    language: z.string().optional(),
  })
  .partial();

export const prefillSchema = z.object({
  /** "activity" reads a property of the activity; "connector" queries an integration; "user" reads the current user. */
  source: z.enum(['activity', 'connector', 'user']),
  /** connector key when source = connector */
  connector: z.string().optional(),
  /** dot path inside the source object, e.g. "externalData.rol" */
  path: z.string().min(1),
  /** when true the user cannot edit the prefilled value */
  locked: z.boolean().optional(),
});

export const formFieldSchema = z.object({
  key: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'La clave solo admite letras, números y _ (debe iniciar con letra)'),
  type: z.enum(FIELD_TYPES),
  label: z.string().min(1),
  help: z.string().optional(),
  placeholder: z.string().optional(),
  required: z.boolean().optional(),
  hidden: z.boolean().optional(),
  readOnly: z.boolean().optional(),
  defaultValue: z.unknown().optional(),
  options: z.array(fieldOptionSchema).optional(),
  config: fieldConfigSchema.optional(),
  prefill: prefillSchema.optional(),
});

export type FormField = z.infer<typeof formFieldSchema>;

export const CONDITION_OPS = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'nin',
  'contains',
  'empty',
  'notEmpty',
] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];

export type Condition =
  | { field: string; op: ConditionOp; value?: unknown }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({ field: z.string().min(1), op: z.enum(CONDITION_OPS), value: z.unknown().optional() }),
    z.object({ all: z.array(conditionSchema) }),
    z.object({ any: z.array(conditionSchema) }),
    z.object({ not: conditionSchema }),
  ]),
);

export const ruleActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('show'), target: z.string().min(1) }),
  z.object({ action: z.literal('hide'), target: z.string().min(1) }),
  z.object({ action: z.literal('require'), target: z.string().min(1) }),
  z.object({ action: z.literal('optional'), target: z.string().min(1) }),
  z.object({ action: z.literal('enable'), target: z.string().min(1) }),
  z.object({ action: z.literal('disable'), target: z.string().min(1) }),
  /** Autofill: literal value or copy of another field ("fromField"). */
  z.object({
    action: z.literal('set'),
    target: z.string().min(1),
    value: z.unknown().optional(),
    fromField: z.string().optional(),
  }),
]);
export type RuleAction = z.infer<typeof ruleActionSchema>;

export const formRuleSchema = z.object({
  id: z.string().optional(),
  description: z.string().optional(),
  when: conditionSchema,
  then: z.array(ruleActionSchema).min(1),
  /** actions applied when the condition is false (optional) */
  otherwise: z.array(ruleActionSchema).optional(),
});
export type FormRule = z.infer<typeof formRuleSchema>;

export const formSchemaDefinition = z
  .object({
    fields: z.array(formFieldSchema),
    rules: z.array(formRuleSchema).default([]),
  })
  .superRefine((def, ctx) => {
    const keys = new Set<string>();
    def.fields.forEach((f, i) => {
      if (keys.has(f.key)) {
        ctx.addIssue({ code: 'custom', path: ['fields', i, 'key'], message: `Clave duplicada: ${f.key}` });
      }
      keys.add(f.key);
      if (OPTION_FIELD_TYPES.includes(f.type) && (!f.options || f.options.length === 0)) {
        ctx.addIssue({ code: 'custom', path: ['fields', i, 'options'], message: `El campo ${f.key} requiere opciones` });
      }
    });
    const collect = (c: Condition, out: string[]) => {
      if ('field' in c) out.push(c.field);
      else if ('all' in c) c.all.forEach((x) => collect(x, out));
      else if ('any' in c) c.any.forEach((x) => collect(x, out));
      else collect(c.not, out);
    };
    def.rules.forEach((r, i) => {
      const refs: string[] = [];
      collect(r.when, refs);
      [...r.then, ...(r.otherwise ?? [])].forEach((a) => {
        refs.push(a.target);
        if (a.action === 'set' && a.fromField) refs.push(a.fromField);
      });
      refs.forEach((ref) => {
        if (!keys.has(ref)) {
          ctx.addIssue({ code: 'custom', path: ['rules', i], message: `La regla referencia un campo inexistente: ${ref}` });
        }
      });
    });
  });

export type FormDefinition = z.infer<typeof formSchemaDefinition>;
