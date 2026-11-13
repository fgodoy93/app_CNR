import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WORKFLOW,
  availableTransitions,
  canExecuteTransition,
  renderTemplate,
  workflowDefinitionSchema,
} from './engine';

const tech = { userId: 'u-tech', roleKey: 'terreno', permissions: ['activities.write'] };
const sup = { userId: 'u-sup', roleKey: 'supervisor', permissions: ['activities.write', 'activities.approve'] };
const admin = { userId: 'u-admin', roleKey: 'admin', permissions: ['*'] };
const t = (key: string) => DEFAULT_WORKFLOW.transitions.find((x) => x.key === key)!;

describe('workflow definition', () => {
  it('default workflow is valid', () => {
    expect(workflowDefinitionSchema.safeParse(DEFAULT_WORKFLOW).success).toBe(true);
  });

  it('rejects transitions to unknown states', () => {
    const bad = { ...DEFAULT_WORKFLOW, transitions: [{ ...t('iniciar'), to: 'NOPE' }] };
    expect(workflowDefinitionSchema.safeParse(bad).success).toBe(false);
  });
});

describe('canExecuteTransition', () => {
  it('only the assignee can start the work', () => {
    const subject = { status: 'ASIGNADA', assigneeId: 'u-tech' };
    expect(canExecuteTransition(DEFAULT_WORKFLOW, t('iniciar'), subject, tech).ok).toBe(true);
    expect(canExecuteTransition(DEFAULT_WORKFLOW, t('iniciar'), { ...subject, assigneeId: 'other' }, tech).ok).toBe(false);
  });

  it('enforces roles for approval levels', () => {
    const subject = { status: 'EN_REVISION', assigneeId: 'u-tech' };
    expect(canExecuteTransition(DEFAULT_WORKFLOW, t('aprobar_n1'), subject, tech).ok).toBe(false);
    expect(canExecuteTransition(DEFAULT_WORKFLOW, t('aprobar_n1'), subject, sup).ok).toBe(true);
  });

  it('rejects transitions from a wrong state', () => {
    const r = canExecuteTransition(DEFAULT_WORKFLOW, t('aprobar_n2'), { status: 'PENDIENTE' }, admin);
    expect(r.ok).toBe(false);
  });

  it('requires comment when configured', () => {
    const subject = { status: 'EN_REVISION' };
    expect(canExecuteTransition(DEFAULT_WORKFLOW, t('observar'), subject, sup).ok).toBe(false);
    expect(canExecuteTransition(DEFAULT_WORKFLOW, t('observar'), subject, sup, { comment: 'Falta foto' }).ok).toBe(true);
  });

  it('requires a valid form when configured', () => {
    const subject = { status: 'EN_EJECUCION', assigneeId: 'u-tech' };
    expect(canExecuteTransition(DEFAULT_WORKFLOW, t('enviar_revision'), subject, tech, { formValid: false }).ok).toBe(false);
    expect(canExecuteTransition(DEFAULT_WORKFLOW, t('enviar_revision'), subject, tech, { formValid: true }).ok).toBe(true);
  });

  it('admin bypasses role restrictions', () => {
    expect(canExecuteTransition(DEFAULT_WORKFLOW, t('aprobar_n2'), { status: 'EN_APROBACION' }, admin).ok).toBe(true);
  });
});

describe('availableTransitions', () => {
  it('lists actions for the supervisor in review', () => {
    const keys = availableTransitions(DEFAULT_WORKFLOW, { status: 'EN_REVISION' }, sup).map((x) => x.key);
    expect(keys).toEqual(['aprobar_n1', 'observar']);
  });
});

describe('renderTemplate', () => {
  it('replaces placeholders including nested paths', () => {
    expect(renderTemplate('OT {{folio}} de {{assignee.name}} {{x}}', { folio: 'OT-1', assignee: { name: 'Ana' } })).toBe('OT OT-1 de Ana ');
  });
});
