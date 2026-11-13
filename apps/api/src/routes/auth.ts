import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../db';
import { verify } from '@node-rs/argon2';
import { unauthorized, badRequest } from '../lib/errors';
import { randomToken, sha256 } from '../lib/crypto';
import { loginSchema } from '@terreno/shared';

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/login', async (req, reply) => {
    const body = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase() },
      include: { role: true, unit: true },
    });

    if (!user || !user.active) {
      throw unauthorized('Credenciales inválidas o usuario inactivo');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw unauthorized('Cuenta bloqueada temporalmente por intentos fallidos');
    }

    const valid = await verify(user.passwordHash, body.password);
    if (!valid) {
      const attempts = user.failedLogins + 1;
      const lock = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLogins: attempts, lockedUntil: lock },
      });
      throw unauthorized('Credenciales inválidas');
    }

    // Reset failed logins on success
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    const accessToken = app.jwt.sign({ sub: user.id, kind: 'user' });
    const rawRefresh = randomToken(40);
    const refreshHash = sha256(rawRefresh);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: refreshHash,
        device: body.device || 'web/mobile',
        ip: req.ip,
        expiresAt,
      },
    });

    return reply.send({
      accessToken,
      refreshToken: rawRefresh,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role.key,
        permissions: user.role.permissions,
        unit: user.unit ? { id: user.unit.id, code: user.unit.code, name: user.unit.name } : null,
      },
    });
  });

  app.post('/refresh', async (req, reply) => {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (!refreshToken) throw badRequest('Falta refreshToken');

    const hash = sha256(refreshToken);
    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash: hash },
      include: { user: { include: { role: true, unit: true } } },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date() || !stored.user.active) {
      throw unauthorized('Refresh token inválido o expirado');
    }

    const accessToken = app.jwt.sign({ sub: stored.user.id, kind: 'user' });
    return reply.send({ accessToken });
  });

  app.get('/me', { preHandler: [app.authenticate] }, async (req) => {
    return { actor: req.actor };
  });
};
