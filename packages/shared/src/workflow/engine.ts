import { z } from 'zod';

export const workflowActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('email'),
    /** recipients: "assignee" | "creator" | "role:<roleKey>" | "unit:<roleKey>" | literal email */
    to: z.array(z.string().min(1)).min(1),
    subject: z.string().min(1),
    body: z.string().optional(),
    attachPdf: z.enum(['REPORT', 'VOUCHER']).optional(),
  }),
  z.object({
    type: z.literal('notify'),
    to: z.array(z.string().min(1)).min(1),
    title: z.string().min(1),
    body: z.string().optional(),
  }),
  z.object({ type: z.literal('pdf'), kind: z.enum(['REPORT', 'VOUCHER']) }),
  z.object({ type: z.literal('webhook'), event: z.string().min(1) }),
  z.object({ type: z.literal('setProgress'), value: z.number().int().min(0).max(100) }),
]);
export type WorkflowAction = z.infer<typeof workflowActionSchema>;

export const workflowStateSchema = z.object({
  key: z.string().regex(/^[A-Z][A-Z0-9_]*$/, 'Use MAYÚSCULAS_CON_GUION_BAJO'),
  label: z.string().min(1),
  color: z.string().optional(),
  /** final states close the activity */
  final: z.boolean().optional(),
  /** category used by dashboards */
  category: z.enum(['open', 'in_progress', 'review', 'done', 'cancelled']).default('open'),
});
export type WorkflowState = z.infer<typeof workflowStateSchema>;

export const workflowTransitionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  from: z.array(z.string()).min(1),
  to: z.string().min(1),
  /** role keys allowed; empty = any role with activities.write */
  roles: z.array(z.string()).default([]),
  /** only the assignee may execute */
  assigneeOnly: z.boolean().optional(),
  requireComment: z.boolean().optional(),
  /** form must validate before executing */
  requireValidForm: z.boolean().optional(),
  /** approval level (1, 2, 3...) shown in traceability */
  approvalLevel: z.number().int().positive().optional(),
  actions: z.array(workflowActionSchema).default([]),
});
export type WorkflowTransition = z.infer<typeof workflowTransitionSchema>;

export const workflowDefinitionSchema = z
  .object({
    initial: z.string().min(1),
    states: z.array(workflowStateSchema).min(2),
    transitions: z.array(workflowTransitionSchema).min(1),
  })
  .superRefine((d, ctx) => {
    const keys = new Set(d.states.map((s) => s.key));
    if (keys.size !== d.states.length) ctx.addIssue({ code: 'custom', path: ['states'], message: 'Estados duplicados' });
    if (!keys.has(d.initial)) ctx.addIssue({ code: 'custom', path: ['initial'], message: 'Estado inicial inexistente' });
    const tkeys = new Set<string>();
    d.transitions.forEach((t, i) => {
      if (tkeys.has(t.key)) ctx.addIssue({ code: 'custom', path: ['transitions', i, 'key'], message: `Transición duplicada: ${t.key}` });
      tkeys.add(t.key);
      if (!keys.has(t.to)) ctx.addIssue({ code: 'custom', path: ['transitions', i, 'to'], message: `Estado destino inexistente: ${t.to}` });
      t.from.forEach((f) => {
        if (f !== '*' && !keys.has(f)) ctx.addIssue({ code: 'custom', path: ['transitions', i, 'from'], message: `Estado origen inexistente: ${f}` });
      });
    });
  });
export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;

export interface TransitionActor {
  userId: string | null;
  roleKey: string;
  permissions: readonly string[];
}

export interface TransitionSubject {
  status: string;
  assigneeId?: string | null;
}

export interface TransitionCheck {
  ok: boolean;
  reason?: string;
}

export function getState(def: WorkflowDefinition, key: string): WorkflowState | undefined {
  return def.states.find((s) => s.key === key);
}

export function canExecuteTransition(
  def: WorkflowDefinition,
  transition: WorkflowTransition,
  subject: TransitionSubject,
  actor: TransitionActor,
  opts: { comment?: string; formValid?: boolean } = {},
): TransitionCheck {
  if (!transition.from.includes('*') && !transition.from.includes(subject.status)) {
    return { ok: false, reason: `La transición "${transition.label}" no aplica al estado actual` };
  }
  const isAdmin = actor.permissions.includes('*');
  if (!isAdmin && transition.roles.length > 0 && !transition.roles.includes(actor.roleKey)) {
    return { ok: false, reason: 'Su rol no está autorizado para esta acción' };
  }
  if (!isAdmin && transition.assigneeOnly && subject.assigneeId !== actor.userId) {
    return { ok: false, reason: 'Solo el responsable asignado puede ejecutar esta acción' };
  }
  if (transition.requireComment && !opts.comment?.trim()) {
    return { ok: false, reason: 'Debe ingresar un comentario' };
  }
  if (transition.requireValidForm && opts.formValid === false) {
    return { ok: false, reason: 'El formulario tiene campos obligatorios sin completar' };
  }
  if (!getState(def, transition.to)) return { ok: false, reason: 'Estado destino inválido' };
  return { ok: true };
}

/** Transitions the actor may execute from the subject's current status. */
export function availableTransitions(
  def: WorkflowDefinition,
  subject: TransitionSubject,
  actor: TransitionActor,
): WorkflowTransition[] {
  return def.transitions.filter((t) => {
    const r = canExecuteTransition(def, t, subject, actor, { comment: 'x', formValid: true });
    return r.ok;
  });
}

/** Default workflow shipped with the platform: request -> execution -> 2-level review -> closure. */
export const DEFAULT_WORKFLOW: WorkflowDefinition = {
  initial: 'PENDIENTE',
  states: [
    { key: 'PENDIENTE', label: 'Pendiente', color: '#64748b', category: 'open' },
    { key: 'ASIGNADA', label: 'Asignada', color: '#0ea5e9', category: 'open' },
    { key: 'EN_EJECUCION', label: 'En ejecución', color: '#f59e0b', category: 'in_progress' },
    { key: 'EN_REVISION', label: 'En revisión (N1)', color: '#8b5cf6', category: 'review' },
    { key: 'EN_APROBACION', label: 'En aprobación (N2)', color: '#a855f7', category: 'review' },
    { key: 'OBSERVADA', label: 'Observada', color: '#ef4444', category: 'in_progress' },
    { key: 'CERRADA', label: 'Cerrada', color: '#16a34a', category: 'done', final: true },
    { key: 'ANULADA', label: 'Anulada', color: '#334155', category: 'cancelled', final: true },
  ],
  transitions: [
    {
      key: 'asignar', label: 'Asignar', from: ['PENDIENTE', 'ASIGNADA'], to: 'ASIGNADA', roles: ['admin', 'supervisor'],
      actions: [{ type: 'notify', to: ['assignee'], title: 'Nueva actividad asignada' }, { type: 'email', to: ['assignee'], subject: 'Se le asignó {{folio}}' }],
    },
    { key: 'iniciar', label: 'Iniciar ejecución', from: ['ASIGNADA', 'OBSERVADA'], to: 'EN_EJECUCION', roles: [], assigneeOnly: true, actions: [{ type: 'setProgress', value: 10 }] },
    {
      key: 'enviar_revision', label: 'Enviar a revisión', from: ['EN_EJECUCION'], to: 'EN_REVISION', roles: [], assigneeOnly: true, requireValidForm: true,
      actions: [{ type: 'setProgress', value: 80 }, { type: 'notify', to: ['role:supervisor'], title: '{{folio}} requiere revisión' }, { type: 'pdf', kind: 'VOUCHER' }],
    },
    {
      key: 'aprobar_n1', label: 'Aprobar (Nivel 1)', from: ['EN_REVISION'], to: 'EN_APROBACION', roles: ['supervisor', 'admin'], approvalLevel: 1,
      actions: [{ type: 'notify', to: ['role:jefatura'], title: '{{folio}} requiere aprobación final' }],
    },
    {
      key: 'observar', label: 'Observar / devolver', from: ['EN_REVISION', 'EN_APROBACION'], to: 'OBSERVADA', roles: ['supervisor', 'jefatura', 'admin'], requireComment: true,
      actions: [{ type: 'notify', to: ['assignee'], title: '{{folio}} fue observada' }, { type: 'email', to: ['assignee'], subject: '{{folio}} fue observada' }],
    },
    {
      key: 'aprobar_n2', label: 'Aprobar y cerrar (Nivel 2)', from: ['EN_APROBACION'], to: 'CERRADA', roles: ['jefatura', 'admin'], approvalLevel: 2,
      actions: [
        { type: 'setProgress', value: 100 },
        { type: 'pdf', kind: 'REPORT' },
        { type: 'email', to: ['assignee', 'creator'], subject: '{{folio}} cerrada y aprobada', attachPdf: 'REPORT' },
        { type: 'webhook', event: 'activity.closed' },
      ],
    },
    { key: 'anular', label: 'Anular', from: ['PENDIENTE', 'ASIGNADA', 'EN_EJECUCION', 'OBSERVADA'], to: 'ANULADA', roles: ['admin', 'supervisor'], requireComment: true, actions: [] },
  ],
};

/** Replaces {{placeholders}} with values from a flat object. */
export function renderTemplate(tpl: string, data: Record<string, unknown>): string {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, k: string) => {
    const v = k.split('.').reduce<unknown>((acc, p) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[p] : undefined), data);
    return v === undefined || v === null ? '' : String(v);
  });
}
