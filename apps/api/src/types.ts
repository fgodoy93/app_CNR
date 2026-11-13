export interface Actor {
  kind: 'user' | 'api';
  /** user id, or null for API clients */
  userId: string | null;
  apiClientId: string | null;
  name: string;
  email?: string;
  roleKey: string;
  permissions: string[];
  unitId: string | null;
  ip?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    actor: Actor;
  }
}

export const SYSTEM_ACTOR: Actor = {
  kind: 'api',
  userId: null,
  apiClientId: null,
  name: 'Sistema',
  roleKey: 'system',
  permissions: ['*'],
  unitId: null,
};
