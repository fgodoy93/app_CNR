import { prisma, type Tx } from '../db';
import { queueEmail } from '../lib/mailer';
import { generateDocument } from './documents';
import { emitEvent } from './webhooks';
import { renderTemplate, type WorkflowTransition, type WorkflowAction } from '@terreno/shared';
import type { Actor } from '../types';
import type { ActivityWithRelations } from './activities';

export async function runTransitionActions(
  actor: Actor,
  activity: ActivityWithRelations,
  transition: WorkflowTransition,
  comment?: string,
  tx: Tx = prisma,
) {
  const templateData = {
    folio: activity.folio,
    title: activity.title,
    status: activity.status,
    priority: activity.priority,
    comment: comment || '',
    actor: actor.name,
    assignee: activity.assignee ? { name: activity.assignee.name, email: activity.assignee.email } : {},
    creator: activity.createdBy ? { name: activity.createdBy.name, email: activity.createdBy.email } : {},
  };

  for (const action of transition.actions) {
    await executeAction(action, actor, activity, templateData, tx);
  }
}

async function resolveRecipients(targets: string[], activity: ActivityWithRelations, tx: Tx): Promise<string[]> {
  const emails: string[] = [];

  for (const target of targets) {
    if (target === 'assignee' && activity.assignee?.email) {
      emails.push(activity.assignee.email);
    } else if (target === 'creator' && activity.createdBy?.email) {
      emails.push(activity.createdBy.email);
    } else if (target.startsWith('role:')) {
      const roleKey = target.replace('role:', '');
      const users = await tx.user.findMany({
        where: { role: { key: roleKey }, active: true },
        select: { email: true },
      });
      emails.push(...users.map((u) => u.email));
    } else if (target.includes('@')) {
      emails.push(target);
    }
  }

  return [...new Set(emails)];
}

async function executeAction(
  action: WorkflowAction,
  actor: Actor,
  activity: ActivityWithRelations,
  templateData: Record<string, unknown>,
  tx: Tx,
) {
  switch (action.type) {
    case 'email': {
      const recipients = await resolveRecipients(action.to, activity, tx);
      const subject = renderTemplate(action.subject, templateData);
      const body = renderTemplate(action.body || '', templateData);
      await queueEmail(recipients, subject, `<p>${body}</p>`);
      break;
    }

    case 'notify': {
      const title = renderTemplate(action.title, templateData);
      const body = renderTemplate(action.body || '', templateData);

      for (const target of action.to) {
        if (target === 'assignee' && activity.assigneeId) {
          await tx.notification.create({
            data: { userId: activity.assigneeId, title, body, link: `/actividades/${activity.id}` },
          });
        } else if (target.startsWith('role:')) {
          const roleKey = target.replace('role:', '');
          const users = await tx.user.findMany({
            where: { role: { key: roleKey }, active: true },
            select: { id: true },
          });
          for (const u of users) {
            await tx.notification.create({
              data: { userId: u.id, title, body, link: `/actividades/${activity.id}` },
            });
          }
        }
      }
      break;
    }

    case 'pdf': {
      await generateDocument(activity.id, action.kind, actor.userId || undefined);
      break;
    }

    case 'webhook': {
      await emitEvent(action.event, activity, tx);
      break;
    }

    case 'setProgress': {
      await tx.activity.update({
        where: { id: activity.id },
        data: { progress: action.value },
      });
      break;
    }
  }
}
