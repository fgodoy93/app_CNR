import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config, corsOrigins } from './config';
import authPlugin, { requirePermission } from './plugins/auth';
import { registry, httpRequests, httpDuration } from './lib/metrics';
import { authRoutes } from './routes/auth';
import { activitiesRoutes } from './routes/activities';
import { geoRoutes } from './routes/geo';
import { evidencesRoutes } from './routes/evidences';
import { syncRoutes } from './routes/sync';
import { reportsRoutes } from './routes/reports';
import { publicRoutes } from './routes/public';
import { adminRoutes } from './routes/admin';
import { formsRoutes, workflowsRoutes } from './routes/forms';
import { integrationsRoutes } from './routes/integrations';
import { processEmailOutbox } from './lib/mailer';
import { processWebhookDeliveries } from './services/webhooks';
import { storage } from './lib/storage';
import { prisma } from './db';
import { AppError } from './lib/errors';
import { ZodError } from 'zod';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport:
        config.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
            }
          : undefined,
    },
    disableRequestLogging: true,
  });

  // Security & standard middlewares
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
  });
  await app.register(multipart, {
    limits: {
      fileSize: config.MAX_UPLOAD_MB * 1024 * 1024,
    },
  });

  // Swagger Documentation (disabled in production)
  if (config.NODE_ENV !== 'production') {
    await app.register(swagger, {
      openapi: {
        info: {
          title: 'TerrenoCNR API REST & Integración',
          description: 'Servicio web para la toma de información en terreno, inspecciones y órdenes de trabajo (CNR Chile)',
          version: '1.0.0',
        },
      },
    });
    await app.register(swaggerUi, { routePrefix: '/docs' });
  }

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({ code: err.code, message: err.message, details: err.details });
    }
    if (err instanceof ZodError) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Datos de entrada inválidos',
        details: err.issues,
      });
    }
    app.log.error(err);
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    const msg = err instanceof Error ? err.message : 'Error interno del servidor';
    return reply.status(status).send({ code: 'INTERNAL_ERROR', message: msg });
  });

  // Metrics collection hook
  app.addHook('onRequest', async (req) => {
    (req.raw as any).startTime = process.hrtime();
  });
  app.addHook('onResponse', async (req, reply) => {
    const diff = process.hrtime((req.raw as any).startTime);
    const duration = diff[0] + diff[1] / 1e9;
    const route = req.routeOptions?.url || req.url;
    httpRequests.inc({ method: req.method, route, status: reply.statusCode });
    httpDuration.observe({ method: req.method, route }, duration);
  });

  // Base endpoints: Health & Metrics
  app.get('/health', async () => {
    const dbOk = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
    const storageOk = await storage.ping();
    return {
      status: dbOk && storageOk ? 'ok' : 'degraded',
      db: dbOk,
      storage: storageOk,
      timestamp: new Date().toISOString(),
    };
  });

  app.get(
    '/metrics',
    { preHandler: config.NODE_ENV === 'production' ? [app.authenticate, requirePermission('audit.view')] : [] },
    async (_req, reply) => {
      reply.header('Content-Type', registry.contentType);
      return registry.metrics();
    },
  );

  // Register Auth
  await app.register(authPlugin);

  // Business API Routes
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(activitiesRoutes, { prefix: '/api/v1/activities' });
  await app.register(geoRoutes, { prefix: '/api/v1/geo' });
  await app.register(evidencesRoutes, { prefix: '/api/v1/evidences' });
  await app.register(syncRoutes, { prefix: '/api/v1/sync' });
  await app.register(reportsRoutes, { prefix: '/api/v1/reports' });
  await app.register(formsRoutes, { prefix: '/api/v1/forms' });
  await app.register(workflowsRoutes, { prefix: '/api/v1/workflows' });
  await app.register(integrationsRoutes, { prefix: '/api/v1/integrations' });
  await app.register(adminRoutes, { prefix: '/api/v1/admin' });
  await app.register(publicRoutes, { prefix: '/api/v1' });

  return app;
}

async function start() {
  const app = await buildApp();
  try {
    await app.listen({ port: config.PORT, host: config.HOST });
    app.log.info(`Servidor API TerrenoCNR corriendo en http://${config.HOST}:${config.PORT}`);
    app.log.info(`Documentación Swagger disponible en http://${config.HOST}:${config.PORT}/docs`);

    if (config.WORKERS_ENABLED) {
      setInterval(() => {
        processEmailOutbox(app.log).catch((err) => app.log.error(err, 'Error worker email'));
        processWebhookDeliveries(app.log).catch((err) => app.log.error(err, 'Error worker webhooks'));
      }, 10000);
      app.log.info('Workers de background activos (Email Outbox & Webhooks)');
    }
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  start();
}
