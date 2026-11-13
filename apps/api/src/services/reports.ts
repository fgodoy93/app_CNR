import ExcelJS from 'exceljs';
import { prisma } from '../db';
import { activityScope } from './activities';
import type { Actor } from '../types';

export async function generateActivitiesExcel(actor: Actor): Promise<Buffer> {
  const activities = await prisma.activity.findMany({
    where: activityScope(actor),
    include: {
      type: true,
      assignee: true,
      createdBy: true,
      unit: true,
      _count: {
        select: {
          evidences: { where: { deletedAt: null } },
          geoFeatures: { where: { deletedAt: null } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TerrenoCNR - Sistema de Toma de Información en Terreno';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Actividades y Órdenes', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
  });

  sheet.columns = [
    { header: 'Folio', key: 'folio', width: 16 },
    { header: 'Título', key: 'title', width: 30 },
    { header: 'Tipo', key: 'type', width: 20 },
    { header: 'Unidad', key: 'unit', width: 18 },
    { header: 'Estado', key: 'status', width: 15 },
    { header: 'Prioridad', key: 'priority', width: 12 },
    { header: 'Progreso (%)', key: 'progress', width: 14 },
    { header: 'Asignado a', key: 'assignee', width: 24 },
    { header: 'Latitud', key: 'lat', width: 14 },
    { header: 'Longitud', key: 'lng', width: 14 },
    { header: 'Dirección / Referencia', key: 'address', width: 30 },
    { header: 'Evidencias', key: 'evidences', width: 12 },
    { header: 'Puntos GPS', key: 'geopoints', width: 12 },
    { header: 'Fecha Creación', key: 'createdAt', width: 20 },
    { header: 'Fecha Cierre', key: 'closedAt', width: 20 },
  ];

  // Header styling
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F4C81' },
  };

  for (const a of activities) {
    sheet.addRow({
      folio: a.folio,
      title: a.title,
      type: a.type.name,
      unit: a.unit?.name || 'General',
      status: a.status,
      priority: a.priority,
      progress: a.progress,
      assignee: a.assignee?.name || 'Sin asignar',
      lat: a.lat || '',
      lng: a.lng || '',
      address: a.address || '',
      evidences: a._count.evidences,
      geopoints: a._count.geoFeatures,
      createdAt: a.createdAt.toISOString(),
      closedAt: a.closedAt ? a.closedAt.toISOString() : '',
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
