import { z } from 'zod';
import { formSchemaDefinition } from './forms/schema';
import { workflowDefinitionSchema } from './workflow/engine';

export const PERMISSIONS = {
  ALL: '*',
  ACTIVITIES_READ_ALL: 'activities.read.all',
  ACTIVITIES_READ_UNIT: 'activities.read.unit',
  ACTIVITIES_READ_OWN: 'activities.read.own',
  ACTIVITIES_CREATE: 'activities.create',
  ACTIVITIES_WRITE: 'activities.write',
  ACTIVITIES_ASSIGN: 'activities.assign',
  ACTIVITIES_APPROVE: 'activities.approve',
  ACTIVITIES_DELETE: 'activities.delete',
  FORMS_MANAGE: 'forms.manage',
  WORKFLOWS_MANAGE: 'workflows.manage',
  TYPES_MANAGE: 'types.manage',
  USERS_MANAGE: 'users.manage',
  INTEGRATIONS_MANAGE: 'integrations.manage',
  REPORTS_VIEW: 'reports.view',
  AUDIT_VIEW: 'audit.view',
  SETTINGS_MANAGE: 'settings.manage',
} as const;
export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_LABELS: Record<Permission, string> = {
  '*': 'Acceso total (administrador)',
  'activities.read.all': 'Ver todas las actividades',
  'activities.read.unit': 'Ver actividades de su unidad',
  'activities.read.own': 'Ver actividades propias/asignadas',
  'activities.create': 'Crear actividades',
  'activities.write': 'Editar / ejecutar actividades',
  'activities.assign': 'Asignar y priorizar',
  'activities.approve': 'Revisar y aprobar',
  'activities.delete': 'Eliminar actividades',
  'forms.manage': 'Administrar formularios',
  'workflows.manage': 'Administrar flujos de trabajo',
  'types.manage': 'Administrar tipos de actividad',
  'users.manage': 'Administrar usuarios, roles y unidades',
  'integrations.manage': 'Administrar integraciones (API, webhooks, MCP)',
  'reports.view': 'Ver reportes y dashboards',
  'audit.view': 'Ver auditoría',
  'settings.manage': 'Configuración del sistema',
};

export function hasPermission(perms: readonly string[], p: Permission): boolean {
  return perms.includes('*') || perms.includes(p);
}

export const PRIORITIES = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABELS: Record<Priority, string> = { BAJA: 'Baja', MEDIA: 'Media', ALTA: 'Alta', CRITICA: 'Crítica' };

export const GEO_KINDS = ['POINT', 'LINE', 'POLYGON', 'TRACK'] as const;
export const EVIDENCE_KINDS = ['PHOTO', 'FILE', 'SIGNATURE', 'AUDIO', 'NOTE'] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/** Formats a human readable folio: PREFIX-YYYY-000123 */
export function formatFolio(prefix: string, year: number, seq: number): string {
  return `${prefix}-${year}-${String(seq).padStart(6, '0')}`;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ---------- DTO schemas (shared by API, web and mobile) ----------

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  device: z.string().max(200).optional(),
});

export const positionSchema = z.union([
  z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
  z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90), z.number()]),
]);

export const geometrySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Point'), coordinates: positionSchema }),
  z.object({ type: z.literal('LineString'), coordinates: z.array(positionSchema).min(2) }),
  z.object({ type: z.literal('Polygon'), coordinates: z.array(z.array(positionSchema).min(4)).min(1) }),
]);

export const activityCreateSchema = z.object({
  id: z.string().regex(UUID_RE).optional(),
  typeId: z.string().min(1),
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional().nullable(),
  priority: z.enum(PRIORITIES).default('MEDIA'),
  assigneeId: z.string().optional().nullable(),
  unitId: z.string().optional().nullable(),
  dueAt: z.string().datetime({ offset: true }).optional().nullable(),
  scheduledAt: z.string().datetime({ offset: true }).optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  data: z.record(z.string(), z.unknown()).optional(),
  externalData: z.record(z.string(), z.unknown()).optional(),
  externalRef: z.string().max(200).optional().nullable(),
  externalSource: z.string().max(100).optional().nullable(),
});
export type ActivityCreateInput = z.infer<typeof activityCreateSchema>;

export const activityUpdateSchema = activityCreateSchema.partial().omit({ id: true, typeId: true }).extend({
  progress: z.number().int().min(0).max(100).optional(),
  /** optimistic concurrency: server version the client edited */
  baseVersion: z.number().int().optional(),
});

export const transitionSchema = z.object({
  transition: z.string().min(1),
  comment: z.string().max(2000).optional(),
});

export const geoFeatureInputSchema = z.object({
  id: z.string().regex(UUID_RE),
  activityId: z.string().min(1),
  kind: z.enum(GEO_KINDS),
  geometry: geometrySchema,
  fieldKey: z.string().optional().nullable(),
  label: z.string().max(200).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  status: z.string().max(50).optional().nullable(),
  observations: z.string().max(5000).optional().nullable(),
  accuracy: z.number().nonnegative().optional().nullable(),
  altitude: z.number().optional().nullable(),
  capturedAt: z.string().datetime({ offset: true }),
});
export type GeoFeatureInput = z.infer<typeof geoFeatureInputSchema>;

/** Metadata sent together with the evidence binary (multipart field "meta"). */
export const evidenceMetaSchema = z.object({
  id: z.string().regex(UUID_RE),
  activityId: z.string().min(1),
  geoFeatureId: z.string().optional().nullable(),
  kind: z.enum(EVIDENCE_KINDS),
  fieldKey: z.string().optional().nullable(),
  note: z.string().max(5000).optional().nullable(),
  transcript: z.string().max(20000).optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  accuracy: z.number().nonnegative().optional().nullable(),
  capturedAt: z.string().datetime({ offset: true }),
  /** "camera" | "gallery" | "file" | "signature-pad" | "recorder" */
  source: z.string().max(30).optional(),
  /** sha256 computed on the device, verified by the server */
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});
export type EvidenceMeta = z.infer<typeof evidenceMetaSchema>;

export const formTemplateSaveSchema = z.object({
  key: z.string().regex(/^[a-z0-9_-]+$/),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  unitId: z.string().optional().nullable(),
  definition: formSchemaDefinition,
});

export const workflowSaveSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  definition: workflowDefinitionSchema,
});

export const activityTypeSaveSchema = z.object({
  key: z.string().regex(/^[a-z0-9_-]+$/),
  name: z.string().min(1).max(200),
  prefix: z.string().regex(/^[A-Z]{2,5}$/),
  color: z.string().default('#0ea5e9'),
  icon: z.string().optional().nullable(),
  formTemplateId: z.string().optional().nullable(),
  workflowId: z.string().optional().nullable(),
  unitId: z.string().optional().nullable(),
  active: z.boolean().default(true),
});

// ---------- Offline sync protocol ----------

export const SYNC_ENTITIES = ['activity', 'geoFeature', 'transition', 'note', 'evidence'] as const;

export const syncMutationSchema = z.object({
  /** unique id generated on the device; makes the push idempotent */
  mutationId: z.string().regex(UUID_RE),
  entity: z.enum(SYNC_ENTITIES),
  op: z.enum(['upsert', 'delete', 'execute']),
  entityId: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  clientTime: z.string().datetime({ offset: true }),
});
export type SyncMutation = z.infer<typeof syncMutationSchema>;

export const syncPushSchema = z.object({
  deviceId: z.string().min(1).max(200),
  mutations: z.array(syncMutationSchema).max(500),
});

export type SyncResultStatus = 'applied' | 'duplicate' | 'conflict' | 'rejected';
export interface SyncResult {
  mutationId: string;
  status: SyncResultStatus;
  entityId: string;
  message?: string;
  serverVersion?: number;
}
