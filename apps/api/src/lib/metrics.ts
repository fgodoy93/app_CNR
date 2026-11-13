import client from 'prom-client';

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry, prefix: 'terreno_' });

export const httpRequests = new client.Counter({
  name: 'terreno_http_requests_total',
  help: 'HTTP requests',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [registry],
});

export const httpDuration = new client.Histogram({
  name: 'terreno_http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route'] as const,
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [registry],
});

export const syncMutations = new client.Counter({
  name: 'terreno_sync_mutations_total',
  help: 'Offline sync mutations processed',
  labelNames: ['status'] as const,
  registers: [registry],
});

export const webhookDeliveries = new client.Counter({
  name: 'terreno_webhook_deliveries_total',
  help: 'Webhook delivery attempts',
  labelNames: ['status'] as const,
  registers: [registry],
});
