import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL ??= 'postgresql://postgres:159753@localhost:5432/terreno_cnr?schema=public';
  process.env.JWT_SECRET ??= 'seguridad_super_secreta_terreno_cnr_clave_jwt_2026_super_larga';
  process.env.APP_ENCRYPTION_KEY ??= '12345678901234567890123456789012';
  process.env.WORKERS_ENABLED = 'false';
});

import { buildApp } from '../src/server';

describe('TerrenoCNR API E2E (PostgreSQL real)', () => {
  let app: FastifyInstance;
  let adminToken = '';
  let techToken = '';
  let activityId = '';

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('health check reports db and storage ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', db: true, storage: true });
  });

  it('authenticates seeded admin and field users', async () => {
    const r1 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'admin@cnr.gob.cl', password: 'Cnr2026!Demo' },
    });
    expect(r1.statusCode).toBe(200);
    adminToken = r1.json().accessToken;

    const r2 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'terreno@cnr.gob.cl', password: 'Cnr2026!Demo' },
    });
    expect(r2.statusCode).toBe(200);
    techToken = r2.json().accessToken;
  });

  it('creates an activity, captures GPS, syncs offline mutation, and exports KML/GeoJSON/CSV/Excel/PDF', async () => {
    const typesRes = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/activity-types',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const inspType = typesRes.json().data.find((t: { key: string }) => t.key === 'inspeccion_obras');
    expect(inspType).toBeDefined();

    const actRes = await app.inject({
      method: 'POST',
      url: '/api/v1/activities',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        typeId: inspType.id,
        title: 'Inspección Bocatoma Canal Maule (E2E)',
        priority: 'ALTA',
        address: 'Región del Maule',
      },
    });
    expect(actRes.statusCode).toBe(201);
    activityId = actRes.json().id;
    expect(actRes.json().folio).toMatch(/^INS-\d{4}-\d{6}$/);

    // Capture GPS point
    const geoRes = await app.inject({
      method: 'POST',
      url: '/api/v1/geo',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        id: randomUUID(),
        activityId,
        kind: 'POINT',
        geometry: { type: 'Point', coordinates: [-71.65, -35.42] },
        label: 'Compuerta Principal',
        accuracy: 3.5,
        capturedAt: new Date().toISOString(),
      },
    });
    expect(geoRes.statusCode).toBe(201);

    // Export KML, GeoJSON, CSV
    const kml = await app.inject({ method: 'GET', url: '/api/v1/geo/export/kml', headers: { authorization: `Bearer ${adminToken}` } });
    expect(kml.statusCode).toBe(200);
    expect(kml.body).toContain('<kml');

    const gj = await app.inject({ method: 'GET', url: '/api/v1/geo/export/geojson', headers: { authorization: `Bearer ${adminToken}` } });
    expect(gj.statusCode).toBe(200);
    expect(gj.json().type).toBe('FeatureCollection');

    const csv = await app.inject({ method: 'GET', url: '/api/v1/geo/export/csv', headers: { authorization: `Bearer ${adminToken}` } });
    expect(csv.statusCode).toBe(200);
    expect(csv.body).toContain('wkt');

    // Offline sync idempotency
    const mutId = randomUUID();
    const push1 = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        deviceId: 'e2e-device',
        mutations: [
          {
            mutationId: mutId,
            entity: 'activity',
            op: 'upsert',
            entityId: activityId,
            payload: { data: { estado_obra: 'conforme', caudal_medido: 420 } },
            clientTime: new Date().toISOString(),
          },
        ],
      },
    });
    expect(push1.statusCode).toBe(200);
    expect(push1.json().results[0].status).toBe('applied');

    const push2 = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        deviceId: 'e2e-device',
        mutations: [
          {
            mutationId: mutId,
            entity: 'activity',
            op: 'upsert',
            entityId: activityId,
            payload: { data: { estado_obra: 'conforme' } },
            clientTime: new Date().toISOString(),
          },
        ],
      },
    });
    expect(push2.json().results[0].status).toBe('duplicate');

    // Generate PDF & verify QR code
    const docRes = await app.inject({
      method: 'POST',
      url: `/api/v1/activities/${activityId}/documents`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { kind: 'REPORT' },
    });
    expect(docRes.statusCode).toBe(201);
    const { verifyCode } = docRes.json();

    const verifyRes = await app.inject({ method: 'GET', url: `/api/v1/verify/${verifyCode}` });
    expect(verifyRes.statusCode).toBe(200);
    expect(verifyRes.json().valid).toBe(true);

    // Excel report
    const xlsx = await app.inject({ method: 'GET', url: '/api/v1/reports/excel', headers: { authorization: `Bearer ${adminToken}` } });
    expect(xlsx.statusCode).toBe(200);
    expect(xlsx.rawPayload.length).toBeGreaterThan(1000);
  });
});
