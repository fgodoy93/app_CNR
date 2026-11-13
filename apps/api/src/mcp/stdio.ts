import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { prisma } from '../db';
import { SYSTEM_ACTOR } from '../types';
import { createActivity, getActivityForActor } from '../services/activities';
import { listGeoFeaturesForMap } from '../services/geo';

const server = new Server(
  {
    name: 'terreno-cnr-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'list_activities',
        description: 'Lista las últimas actividades y órdenes de trabajo registradas en TerrenoCNR',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Número máximo de registros' },
          },
        },
      },
      {
        name: 'get_activity',
        description: 'Obtiene el detalle completo de una actividad o folio específico',
        inputSchema: {
          type: 'object',
          properties: {
            idOrFolio: { type: 'string', description: 'ID o Folio de la actividad (ej. INS-2026-000001)' },
          },
          required: ['idOrFolio'],
        },
      },
      {
        name: 'create_work_order',
        description: 'Crea una nueva orden de trabajo o inspección desde un sistema institucional o IA',
        inputSchema: {
          type: 'object',
          properties: {
            typeId: { type: 'string', description: 'ID del tipo de actividad' },
            title: { type: 'string', description: 'Título descriptivo' },
            description: { type: 'string', description: 'Detalle de la orden' },
            priority: { type: 'string', enum: ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'] },
            address: { type: 'string', description: 'Ubicación o dirección referencial' },
            lat: { type: 'number', description: 'Latitud' },
            lng: { type: 'number', description: 'Longitud' },
          },
          required: ['typeId', 'title'],
        },
      },
      {
        name: 'get_geo_features',
        description: 'Obtiene las geometrías y puntos georreferenciados capturados en terreno',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'list_activities': {
      const limit = Number(args?.limit) || 20;
      const acts = await prisma.activity.findMany({
        where: { deletedAt: null },
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { type: true, assignee: true },
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(acts, null, 2) }],
      };
    }

    case 'get_activity': {
      const act = await getActivityForActor(SYSTEM_ACTOR, String(args?.idOrFolio));
      return {
        content: [{ type: 'text', text: JSON.stringify(act, null, 2) }],
      };
    }

    case 'create_work_order': {
      const res = await createActivity(SYSTEM_ACTOR, args as any);
      return {
        content: [{ type: 'text', text: JSON.stringify(res.activity, null, 2) }],
      };
    }

    case 'get_geo_features': {
      const features = await listGeoFeaturesForMap(SYSTEM_ACTOR);
      return {
        content: [{ type: 'text', text: JSON.stringify(features, null, 2) }],
      };
    }

    default:
      throw new Error(`Herramienta desconocida: ${name}`);
  }
});

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

run().catch(console.error);
