import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { hasPermission, type Permission } from '@terreno/shared';
import { config } from '../config';
import { prisma } from '../db';
import { sha256 } from '../lib/crypto';
import { forbidden, unauthorized } from '../lib/errors';
import type { Actor } from '../types';

export interface JwtPayload {
  sub: string;
  kind: 'user' | 'api';
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export const API_KEY_PREFIX = 'tc_';

export function parseApiKey(raw: string): { prefix: string; full: string } | null {
  const m = /^tc_([a-z0-9]{8})_[A-Za-z0-9_-]{20,}$/.exec(raw.trim());
  return m ? { prefix: m[1]!, full: raw.trim() } : null;
}

export async function actorFromApiKey(raw: string, ip?: string): Promise<Actor | null> {
  const parsed = parseApiKey(raw);
  if (!parsed) return null;
  const client = await prisma.apiClient.findUnique({ where: { keyPrefix: parsed.prefix } });
  if (!client || !client.active || client.keyHash !== sha256(parsed.full)) return null;
  void prisma.apiClient.update({ where: { id: client.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  return apiActor(client, ip);
}

function apiActor(client: { id: string; name: string; scopes: string[] }, ip?: string): Actor {
  return {
    kind: 'api',
    userId: null,
    apiClientId: client.id,
    name: `API: ${client.name}`,
    roleKey: 'integration',
    permissions: client.scopes,
    unitId: null,
    ip,
  };
}

export async function actorFromUserId(userId: string, ip?: string): Promise<Actor | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
  if (!user || !user.active) return null;
  return {
    kind: 'user',
    userId: user.id,
    apiClientId: null,
    name: user.name,
    email: user.email,
    roleKey: user.role.key,
    permissions: user.role.permissions,
    unitId: user.unitId,
    ip,
  };
}

export default fp(async (app) => {
  await app.register(jwt, { secret: config.JWT_SECRET, sign: { expiresIn: config.ACCESS_TOKEN_TTL } });

  app.decorateRequest('actor', null as unknown as Actor);

  app.decorate('authenticate', async (req: FastifyRequest) => {
    const header = req.headers.authorization ?? '';
    const apiKey = (req.headers['x-api-key'] as string | undefined) ?? (header.startsWith('ApiKey ') ? header.slice(7) : undefined);
    if (apiKey) {
      const actor = await actorFromApiKey(apiKey, req.ip);
      if (!actor) throw unauthorized('API key inválida o revocada');
      req.actor = actor;
      return;
    }
    let payload: JwtPayload;
    try {
      payload = await req.jwtVerify<JwtPayload>();
    } catch {
      throw unauthorized('Token inválido o expirado');
    }
    if (payload.kind === 'api') {
      const client = await prisma.apiClient.findUnique({ where: { id: payload.sub } });
      if (!client?.active) throw unauthorized('Cliente API revocado');
      req.actor = apiActor(client, req.ip);
      return;
    }
    const actor = await actorFromUserId(payload.sub, req.ip);
    if (!actor) throw unauthorized('Usuario inactivo');
    req.actor = actor;
  });
});

export function requirePermission(...perms: Permission[]) {
  return async (req: FastifyRequest) => {
    if (!req.actor) throw unauthorized();
    if (!perms.some((p) => hasPermission(req.actor.permissions, p))) throw forbidden();
  };
}

export function can(actor: Actor, p: Permission) {
  return hasPermission(actor.permissions, p);
}
