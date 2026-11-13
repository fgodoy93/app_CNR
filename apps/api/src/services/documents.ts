import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { prisma } from '../db';
import { storage } from '../lib/storage';
import { sha256, verificationCode } from '../lib/crypto';
import { config } from '../config';
import { notFound } from '../lib/errors';
import type { DocumentKind } from '@prisma/client';

export async function generateDocument(
  activityId: string,
  kind: DocumentKind,
  generatedBy?: string,
): Promise<{ id: string; verifyCode: string }> {
  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    include: {
      type: true,
      assignee: true,
      createdBy: true,
      unit: true,
      geoFeatures: { where: { deletedAt: null } },
      evidences: { where: { deletedAt: null } },
      transitions: {
        include: { user: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!activity) throw notFound('Actividad no encontrada');

  const code = verificationCode();
  const verifyUrl = `${config.PUBLIC_API_URL}/api/v1/verify/${code}`;
  const qrBuffer = await QRCode.toBuffer(verifyUrl, { width: 120, margin: 1 });

  const pdfBuffer = await buildPdf(activity, kind, code, qrBuffer);
  const hash = sha256(pdfBuffer);
  const storageKey = `documents/${activity.id}/${kind.toLowerCase()}-${code}.pdf`;

  const { encrypted } = await storage.put(storageKey, pdfBuffer, {
    contentType: 'application/pdf',
    encrypt: false, // Keep PDFs accessible for official display/verification
  });

  const doc = await prisma.document.create({
    data: {
      activityId: activity.id,
      kind,
      verifyCode: code,
      storageKey,
      sha256: hash,
      size: pdfBuffer.length,
      generatedBy: generatedBy || 'system',
    },
  });

  return { id: doc.id, verifyCode: doc.verifyCode };
}

function buildPdf(
  activity: any,
  kind: DocumentKind,
  code: string,
  qrBuffer: Buffer,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header institucional
    doc.rect(0, 0, doc.page.width, 70).fill('#0f4c81');
    doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold')
      .text('COMISIÓN NACIONAL DE RIEGO (CNR)', 40, 20);
    doc.fontSize(11).font('Helvetica')
      .text(kind === 'VOUCHER' ? 'COMPROBANTE DE RECEPCIÓN EN TERRENO' : 'INFORME TÉCNICO DE INSPECCIÓN EN TERRENO', 40, 42);

    doc.fillColor('#1e293b');
    let y = 90;

    // Metadatos principales
    doc.fontSize(14).font('Helvetica-Bold').text(`Folio: ${activity.folio}`, 40, y);
    doc.fontSize(10).font('Helvetica')
      .text(`Fecha de emisión: ${new Date().toLocaleDateString('es-CL')} ${new Date().toLocaleTimeString('es-CL')}`, 320, y);

    y += 25;
    doc.roundedRect(40, y, 515, 60, 4).lineWidth(1).strokeColor('#cbd5e1').stroke();
    doc.fontSize(9).font('Helvetica-Bold').text('Título:', 50, y + 10);
    doc.font('Helvetica').text(activity.title, 110, y + 10, { width: 300 });

    doc.font('Helvetica-Bold').text('Tipo / Unidad:', 50, y + 25);
    doc.font('Helvetica').text(`${activity.type.name} - ${activity.unit?.name || 'General'}`, 130, y + 25);

    doc.font('Helvetica-Bold').text('Estado / Prioridad:', 50, y + 40);
    doc.font('Helvetica').text(`${activity.status} (Prioridad: ${activity.priority})`, 150, y + 40);

    // QR de validación en la esquina superior derecha del bloque
    doc.image(qrBuffer, 440, y + 5, { width: 50 });
    doc.fontSize(7).text(`Verificar: ${code}`, 430, y + 57, { width: 75, align: 'center' });

    y += 75;

    // Personal involucrado
    doc.fontSize(11).font('Helvetica-Bold').text('Responsables', 40, y);
    y += 15;
    doc.fontSize(9).font('Helvetica')
      .text(`Creado por: ${activity.createdBy?.name || 'N/A'} (${activity.createdBy?.email || ''})`, 40, y);
    y += 12;
    doc.text(`Asignado a: ${activity.assignee?.name || 'Sin asignar'} (${activity.assignee?.email || ''})`, 40, y);

    y += 20;

    // Resumen de Puntos y Evidencias
    doc.fontSize(11).font('Helvetica-Bold').text('Resumen de Actividades en Terreno', 40, y);
    y += 15;
    doc.fontSize(9).font('Helvetica')
      .text(`• Puntos y geometrías capturadas: ${activity.geoFeatures.length}`, 40, y);
    y += 12;
    doc.text(`• Evidencias y archivos adjuntos: ${activity.evidences.length}`, 40, y);

    if (activity.geoFeatures.length > 0) {
      y += 18;
      doc.fontSize(10).font('Helvetica-Bold').text('Puntos georreferenciados principales:', 40, y);
      y += 14;
      activity.geoFeatures.slice(0, 5).forEach((gf: any) => {
        const coords = gf.geometry?.coordinates ? JSON.stringify(gf.geometry.coordinates) : 'S/C';
        doc.fontSize(8).font('Helvetica')
          .text(`[${gf.code}] ${gf.label || gf.kind}: Precisión ±${gf.accuracy || '?'}m - Coordenadas: ${coords.slice(0, 45)}...`, 50, y);
        y += 12;
      });
    }

    y += 20;

    // Historial y Trazabilidad de Aprobaciones
    doc.fontSize(11).font('Helvetica-Bold').text('Historial de Aprobaciones y Flujo', 40, y);
    y += 15;

    if (activity.transitions.length === 0) {
      doc.fontSize(8).font('Helvetica-Oblique').text('Sin transiciones registradas aún.', 40, y);
      y += 12;
    } else {
      activity.transitions.forEach((t: any) => {
        const dateStr = new Date(t.createdAt).toLocaleString('es-CL');
        doc.fontSize(8).font('Helvetica-Bold').text(`${dateStr} - ${t.label} (${t.fromStatus} → ${t.toStatus})`, 40, y);
        doc.font('Helvetica').text(`Por: ${t.user?.name || 'Sistema'}${t.comment ? ` - Obs: "${t.comment}"` : ''}`, 40, y + 10);
        y += 24;
      });
    }

    // Pie de página de seguridad
    const bottomY = doc.page.height - 45;
    doc.rect(40, bottomY - 5, 515, 1).fill('#cbd5e1');
    doc.fontSize(7).fillColor('#64748b').text(
      `Documento emitido electrónicamente bajo Ley N° 19.799. Código de verificación único: ${code} - SHA256: ${activity.id.slice(0, 16)}...`,
      40,
      bottomY,
      { align: 'center', width: 515 }
    );

    doc.end();
  });
}
