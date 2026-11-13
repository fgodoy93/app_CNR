import type { FastifyPluginAsync } from 'fastify';
import { addGeoFeature, listGeoFeaturesForMap } from '../services/geo';
import { geoFeatureInputSchema, toGeoJSON, toKML, toCSV } from '@terreno/shared';

export const geoRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.get('/', async (req) => {
    const features = await listGeoFeaturesForMap(req.actor);
    return { data: features };
  });

  app.post('/', async (req, reply) => {
    const input = geoFeatureInputSchema.parse(req.body);
    const result = await addGeoFeature(req.actor, input as any);
    return reply.status(201).send(result);
  });

  app.get('/export/geojson', async (req, reply) => {
    const features = await listGeoFeaturesForMap(req.actor);
    const gj = toGeoJSON(features as any);
    reply.header('Content-Type', 'application/geo+json');
    reply.header('Content-Disposition', 'attachment; filename="terreno-cnr.geojson"');
    return gj;
  });

  app.get('/export/kml', async (req, reply) => {
    const features = await listGeoFeaturesForMap(req.actor);
    const kml = toKML(features as any, 'CNR - Coordenadas en Terreno');
    reply.header('Content-Type', 'application/vnd.google-earth.kml+xml');
    reply.header('Content-Disposition', 'attachment; filename="terreno-cnr.kml"');
    return kml;
  });

  app.get('/export/csv', async (req, reply) => {
    const features = await listGeoFeaturesForMap(req.actor);
    const csv = toCSV(features as any);
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', 'attachment; filename="terreno-cnr.csv"');
    return csv;
  });
};
