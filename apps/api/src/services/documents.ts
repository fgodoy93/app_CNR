import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { prisma } from '../db';
import { storage } from '../lib/storage';
import { sha256, verificationCode } from '../lib/crypto';
import { config } from '../config';
import { notFound } from '../lib/errors';
import type { DocumentKind } from '@prisma/client';

interface LoadedPhoto {
  id: string;
  fileName: string;
  capturedAt: Date;
  uploader: string;
  lat: number | null;
  lng: number | null;
  buffer: Buffer;
}

interface OsmMapTile {
  buffer: Buffer;
  zoom: number;
  tileX: number;
  tileY: number;
}

function lngToTileX(lng: number, zoom: number): number {
  return ((lng + 180) / 360) * Math.pow(2, zoom);
}

function latToTileY(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, zoom);
}

function extractAllPositions(activity: any): [number, number][] {
  const pts: [number, number][] = [];
  if (typeof activity.lat === 'number' && typeof activity.lng === 'number') {
    pts.push([activity.lng, activity.lat]);
  }
  for (const gf of activity.geoFeatures ?? []) {
    const g = gf.geometry;
    if (!g || !g.coordinates) continue;
    if (g.type === 'Point' && Array.isArray(g.coordinates)) {
      pts.push([Number(g.coordinates[0]), Number(g.coordinates[1])]);
    } else if (g.type === 'LineString' && Array.isArray(g.coordinates)) {
      for (const c of g.coordinates) pts.push([Number(c[0]), Number(c[1])]);
    } else if (g.type === 'Polygon' && Array.isArray(g.coordinates)) {
      for (const ring of g.coordinates) {
        for (const c of ring) pts.push([Number(c[0]), Number(c[1])]);
      }
    }
  }
  return pts.filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
}

async function fetchOsmBackground(pts: [number, number][]): Promise<{
  tiles: OsmMapTile[];
  zoom: number;
  minTileX: number;
  minTileY: number;
  cols: number;
  rows: number;
} | null> {
  if (pts.length === 0) return null;
  let minLng = Infinity,
    maxLng = -Infinity,
    minLat = Infinity,
    maxLat = -Infinity;
  for (const [lng, lat] of pts) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  const cLng = (minLng + maxLng) / 2;
  const cLat = (minLat + maxLat) / 2;
  const span = Math.max(maxLng - minLng, maxLat - minLat);
  let zoom = 15;
  if (span > 0.4) zoom = 10;
  else if (span > 0.15) zoom = 11;
  else if (span > 0.06) zoom = 12;
  else if (span > 0.025) zoom = 13;
  else if (span > 0.008) zoom = 14;

  const cx = Math.floor(lngToTileX(cLng, zoom));
  const cy = Math.floor(latToTileY(cLat, zoom));
  const cols = 3;
  const rows = 2;
  const minTileX = cx - 1;
  const minTileY = cy;

  const tiles: OsmMapTile[] = [];
  try {
    await Promise.all(
      Array.from({ length: cols * rows }).map(async (_, idx) => {
        const dx = idx % cols;
        const dy = Math.floor(idx / cols);
        const tx = minTileX + dx;
        const ty = minTileY + dy;
        const url = `https://tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'TerrenoCNR-OfficialPDF/1.0' },
          signal: AbortSignal.timeout(3500),
        });
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          tiles.push({ buffer: buf, zoom, tileX: tx, tileY: ty });
        }
      }),
    );
  } catch {
    return null;
  }

  return tiles.length > 0 ? { tiles, zoom, minTileX, minTileY, cols, rows } : null;
}

function loadBrandLogo(): Buffer | null {
  const candidates = [
    resolve(process.cwd(), '../web/public/cnr-logo.png'),
    resolve(process.cwd(), 'apps/web/public/cnr-logo.png'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        return readFileSync(p);
      } catch {
        return null;
      }
    }
  }
  return null;
}

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
      formVersion: true,
      geoFeatures: { where: { deletedAt: null }, orderBy: { capturedAt: 'asc' } },
      evidences: {
        where: { deletedAt: null },
        include: { uploadedBy: { select: { name: true } } },
        orderBy: { capturedAt: 'asc' },
      },
      transitions: {
        include: { user: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!activity) throw notFound('Actividad no encontrada');

  const allEvIds = (
    await prisma.evidence.findMany({ where: { activityId: activity.id }, select: { id: true } })
  ).map((e) => e.id);
  const geoIds = activity.geoFeatures.map((g) => g.id);

  const auditLogs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entity: 'activity', entityId: activity.id },
        ...(allEvIds.length ? [{ entity: 'evidence', entityId: { in: allEvIds } }] : []),
        ...(geoIds.length ? [{ entity: 'geoFeature', entityId: { in: geoIds } }] : []),
        { changes: { path: ['meta', 'activityId'], equals: activity.id } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: 60,
  });

  // Load up to 6 photos from storage for embedding
  const photos: LoadedPhoto[] = [];
  for (const ev of activity.evidences) {
    if (photos.length >= 6) break;
    if (ev.kind === 'PHOTO' && ev.storageKey) {
      const mime = (ev.mimeType || '').toLowerCase();
      if (mime.includes('jpeg') || mime.includes('jpg') || mime.includes('png')) {
        try {
          const buf = await storage.get(ev.storageKey, ev.encrypted);
          photos.push({
            id: ev.id,
            fileName: ev.fileName || 'Fotografía en terreno',
            capturedAt: ev.capturedAt,
            uploader: ev.uploadedBy?.name || 'Usuario',
            lat: ev.lat,
            lng: ev.lng,
            buffer: buf,
          });
        } catch {
          // ignore unreadable photo
        }
      }
    }
  }

  const pts = extractAllPositions(activity);
  const osmBg = await fetchOsmBackground(pts);
  const logoBuf = loadBrandLogo();

  const code = verificationCode();
  const verifyUrl = `${config.PUBLIC_API_URL}/api/v1/verify/${code}`;
  const qrBuffer = await QRCode.toBuffer(verifyUrl, { width: 140, margin: 1 });

  const pdfBuffer = await buildPdf({
    activity,
    kind,
    code,
    qrBuffer,
    logoBuf,
    photos,
    osmBg,
    auditLogs,
  });

  const hash = sha256(pdfBuffer);
  const storageKey = `documents/${activity.id}/${kind.toLowerCase()}-${code}.pdf`;

  await storage.put(storageKey, pdfBuffer, {
    contentType: 'application/pdf',
    encrypt: false,
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

function formatFormValue(field: any, val: unknown): string {
  if (val === null || val === undefined || val === '') return 'Sin respuesta';
  if (typeof val === 'boolean') return val ? 'Sí' : 'No';
  if (field?.type === 'select' || field?.type === 'radio') {
    const opt = (field.options ?? []).find((o: any) => o.value === val);
    return opt ? opt.label : String(val);
  }
  if (field?.type === 'multiselect' && Array.isArray(val)) {
    return val
      .map((v) => {
        const opt = (field.options ?? []).find((o: any) => o.value === v);
        return opt ? opt.label : String(v);
      })
      .join(', ');
  }
  if (Array.isArray(val)) {
    return `${val.length} elemento(s) adjunto(s)`;
  }
  return String(val);
}

function buildPdf(ctx: {
  activity: any;
  kind: DocumentKind;
  code: string;
  qrBuffer: Buffer;
  logoBuf: Buffer | null;
  photos: LoadedPhoto[];
  osmBg: Awaited<ReturnType<typeof fetchOsmBackground>>;
  auditLogs: any[];
}): Promise<Buffer> {
  const { activity, kind, code, qrBuffer, logoBuf, photos, osmBg, auditLogs } = ctx;
  const PRIMARY = '#006fb3';
  const GREEN = '#146c43';
  const RED = '#e22c2c';
  const BORDER = '#d9e2ec';
  const BG_SOFT = '#f7f9fb';
  const TEXT = '#222222';
  const MUTED = '#4a5568';

  return new Promise((resolvePromise, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolvePromise(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageW = doc.page.width;
    const contentW = pageW - 80; // 515
    let y = 0;

    const drawTopStripe = () => {
      doc.rect(0, 0, pageW / 2, 5).fill(PRIMARY);
      doc.rect(pageW / 2, 0, pageW / 2, 5).fill(RED);
    };

    const ensureSpace = (needed: number) => {
      if (y + needed > doc.page.height - 60) {
        doc.addPage();
        drawTopStripe();
        y = 32;
      }
    };

    const drawSectionHeader = (title: string) => {
      ensureSpace(34);
      doc.rect(40, y, 4, 15).fill(PRIMARY);
      doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(11).text(title, 50, y + 1);
      y += 20;
      doc.moveTo(40, y).lineTo(40 + contentW, y).lineWidth(0.7).strokeColor(BORDER).stroke();
      y += 8;
    };

    // ==================== HEADER INSTITUCIONAL ====================
    drawTopStripe();
    y = 18;
    if (logoBuf) {
      try {
        doc.image(logoBuf, 40, y, { height: 48 });
      } catch {
        doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(15).text('CNR · Comisión Nacional de Riego', 40, y + 10);
      }
    } else {
      doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(15).text('CNR · Comisión Nacional de Riego', 40, y + 10);
    }

    // Título derecho + QR
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8).text('MINISTERIO DE AGRICULTURA · GOBIERNO DE CHILE', 180, y + 2, {
      width: 280,
      align: 'right',
    });
    doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(12).text(
      kind === 'VOUCHER' ? 'COMPROBANTE OFICIAL DE RECEPCIÓN' : 'INFORME TÉCNICO DE INSPECCIÓN EN TERRENO',
      180,
      y + 15,
      { width: 280, align: 'right' },
    );
    doc.fillColor(TEXT).font('Helvetica').fontSize(8.5).text(
      `Folio: ${activity.folio}  |  Emisión: ${new Date().toLocaleString('es-CL')}`,
      180,
      y + 33,
      { width: 280, align: 'right' },
    );

    doc.image(qrBuffer, 485, y - 2, { width: 68 });
    doc.fillColor(MUTED).font('Helvetica').fontSize(6.5).text(`Verificación: ${code}`, 478, y + 67, { width: 82, align: 'center' });

    y = 100;
    doc.moveTo(40, y).lineTo(40 + contentW, y).lineWidth(1).strokeColor(PRIMARY).stroke();
    y += 12;

    // ==================== 1. FICHA GENERAL OT ====================
    drawSectionHeader('1. Información General de la Orden de Trabajo');
    doc.roundedRect(40, y, contentW, 102, 4).fillAndStroke(BG_SOFT, BORDER);

    const col1X = 52;
    const col2X = 310;
    doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(9).text('Título:', col1X, y + 10);
    doc.font('Helvetica').text(activity.title, col1X + 45, y + 10, { width: 440 });

    doc.font('Helvetica-Bold').text('Proceso:', col1X, y + 28);
    doc.font('Helvetica').text(activity.type?.name || 'N/A', col1X + 50, y + 28, { width: 195 });
    doc.font('Helvetica-Bold').text('Unidad:', col2X, y + 28);
    doc.font('Helvetica').text(activity.unit?.name || 'General', col2X + 45, y + 28, { width: 190 });

    doc.font('Helvetica-Bold').text('Estado:', col1X, y + 44);
    doc.font('Helvetica').text(`${activity.status} (${activity.progress ?? 0}%)`, col1X + 45, y + 44);
    doc.font('Helvetica-Bold').text('Prioridad:', col2X, y + 44);
    doc.font('Helvetica').text(activity.priority, col2X + 52, y + 44);

    doc.font('Helvetica-Bold').text('Creado por:', col1X, y + 60);
    doc.font('Helvetica').text(
      `${activity.createdBy?.name || 'Sistema'} (${new Date(activity.createdAt).toLocaleString('es-CL')})`,
      col1X + 58,
      y + 60,
      { width: 195 },
    );
    doc.font('Helvetica-Bold').text('Asignado a:', col2X, y + 60);
    doc.font('Helvetica').text(activity.assignee?.name || 'Sin asignar', col2X + 58, y + 60, { width: 175 });

    doc.font('Helvetica-Bold').text('Ubicación:', col1X, y + 78);
    const locTxt = activity.address
      ? `${activity.address}${typeof activity.lat === 'number' ? ` (${activity.lat.toFixed(5)}, ${activity.lng.toFixed(5)})` : ''}`
      : typeof activity.lat === 'number'
        ? `${activity.lat.toFixed(5)}, ${activity.lng.toFixed(5)}`
        : 'Sin dirección registrada';
    doc.font('Helvetica').text(locTxt, col1X + 55, y + 78, { width: 435 });

    y += 112;

    if (activity.description) {
      ensureSpace(36);
      doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8.5).text('Descripción:', 40, y);
      doc.fillColor(TEXT).font('Helvetica').fontSize(8.5).text(activity.description, 40, y + 12, { width: contentW });
      y = doc.y + 10;
    }

    // ==================== 2. FORMULARIO DIGITAL ====================
    const formFields: any[] = activity.formVersion?.definition?.fields ?? [];
    const formData: Record<string, unknown> = (activity.data as Record<string, unknown>) || {};
    const answerFields = formFields.filter((f) => f.type !== 'section');

    if (answerFields.length > 0) {
      drawSectionHeader('2. Respuestas del Formulario Digital en Terreno');
      for (const f of answerFields) {
        const valText = formatFormValue(f, formData[f.key]);
        const rowH = Math.max(20, doc.heightOfString(valText, { width: 295 }) + 8);
        ensureSpace(rowH + 4);
        doc.rect(40, y, contentW, rowH).fillAndStroke('#ffffff', BORDER);
        doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8.5).text(f.label || f.key, 48, y + 6, { width: 195 });
        doc.fillColor(TEXT).font('Helvetica').fontSize(8.5).text(valText, 250, y + 6, { width: 295 });
        y += rowH;
      }
      y += 12;
    }

    // ==================== 3. MAPA DE UBICACIÓN Y TRAZADO ====================
    const pts = extractAllPositions(activity);
    if (pts.length > 0 || activity.geoFeatures.length > 0) {
      drawSectionHeader('3. Mapa de Ubicación y Trazado Geográfico');
      const mapX = 40;
      const mapW = contentW;
      const mapH = 215;
      ensureSpace(mapH + 35);

      doc.save();
      doc.rect(mapX, y, mapW, mapH).clip();
      doc.rect(mapX, y, mapW, mapH).fill('#e8f0ec');

      // Project helper
      let toCanvas: (lng: number, lat: number) => [number, number];
      if (osmBg) {
        const tilePxW = mapW / osmBg.cols;
        const tilePxH = mapH / osmBg.rows;
        for (const t of osmBg.tiles) {
          const dx = t.tileX - osmBg.minTileX;
          const dy = t.tileY - osmBg.minTileY;
          try {
            doc.image(t.buffer, mapX + dx * tilePxW, y + dy * tilePxH, { width: tilePxW + 0.5, height: tilePxH + 0.5 });
          } catch {
            // ignore tile render error
          }
        }
        toCanvas = (lng: number, lat: number) => {
          const tx = lngToTileX(lng, osmBg.zoom);
          const ty = latToTileY(lat, osmBg.zoom);
          return [mapX + (tx - osmBg.minTileX) * tilePxW, y + (ty - osmBg.minTileY) * tilePxH];
        };
      } else {
        // Offline vector grid fallback
        for (let gx = 0; gx <= mapW; gx += 40) {
          doc.moveTo(mapX + gx, y).lineTo(mapX + gx, y + mapH).lineWidth(0.4).strokeColor('#cbd5e1').stroke();
        }
        for (let gy = 0; gy <= mapH; gy += 40) {
          doc.moveTo(mapX, y + gy).lineTo(mapX + mapW, y + gy).lineWidth(0.4).strokeColor('#cbd5e1').stroke();
        }
        let minLng = Infinity,
          maxLng = -Infinity,
          minLat = Infinity,
          maxLat = -Infinity;
        for (const [lng, lat] of pts) {
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
        const padLng = Math.max(0.002, (maxLng - minLng) * 0.2);
        const padLat = Math.max(0.002, (maxLat - minLat) * 0.2);
        minLng -= padLng;
        maxLng += padLng;
        minLat -= padLat;
        maxLat += padLat;
        toCanvas = (lng: number, lat: number) => [
          mapX + ((lng - minLng) / (maxLng - minLng || 1)) * mapW,
          y + mapH - ((lat - minLat) / (maxLat - minLat || 1)) * mapH,
        ];
      }

      // Draw activity pin if present
      if (typeof activity.lat === 'number' && typeof activity.lng === 'number') {
        const [px, py] = toCanvas(activity.lng, activity.lat);
        doc.circle(px, py, 6).fillAndStroke(RED, '#ffffff');
      }

      // Draw GeoFeatures (Polygons, Lines/Tracks, Points)
      for (const gf of activity.geoFeatures) {
        const g = gf.geometry;
        if (!g || !g.coordinates) continue;
        if (g.type === 'Polygon') {
          const ring = g.coordinates[0] as [number, number][];
          if (ring?.length >= 3) {
            const mapped = ring.map(([lng, lat]) => toCanvas(lng, lat));
            doc.save();
            doc.moveTo(mapped[0]![0], mapped[0]![1]);
            for (let i = 1; i < mapped.length; i++) doc.lineTo(mapped[i]![0], mapped[i]![1]);
            doc.closePath().fillOpacity(0.28).fillAndStroke(GREEN, GREEN);
            doc.restore();
            const [lx, ly] = mapped[0]!;
            doc.rect(lx + 4, ly - 10, 62, 12).fill('#ffffff');
            doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(7).text(gf.code, lx + 6, ly - 8);
          }
        } else if (g.type === 'LineString') {
          const coords = g.coordinates as [number, number][];
          if (coords.length >= 2) {
            const mapped = coords.map(([lng, lat]) => toCanvas(lng, lat));
            doc.moveTo(mapped[0]![0], mapped[0]![1]);
            for (let i = 1; i < mapped.length; i++) doc.lineTo(mapped[i]![0], mapped[i]![1]);
            doc.lineWidth(2.5).strokeColor(gf.kind === 'TRACK' ? '#d97706' : PRIMARY).stroke();
            const [lx, ly] = mapped[0]!;
            doc.rect(lx + 4, ly - 10, 62, 12).fill('#ffffff');
            doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(7).text(gf.code, lx + 6, ly - 8);
          }
        } else if (g.type === 'Point') {
          const [lng, lat] = g.coordinates as [number, number];
          const [px, py] = toCanvas(lng, lat);
          doc.circle(px, py, 5.5).lineWidth(1.5).fillAndStroke(PRIMARY, '#ffffff');
          doc.rect(px + 7, py - 7, 68, 12).fill('#ffffff');
          doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(7).text(gf.label ? `${gf.code}` : gf.kind, px + 9, py - 5);
        }
      }
      doc.restore();

      // Map border & legend
      doc.rect(mapX, y, mapW, mapH).lineWidth(1).strokeColor(BORDER).stroke();
      y += mapH + 5;
      doc.fillColor(MUTED).font('Helvetica').fontSize(7.5).text(
        'Leyenda: ● Azul = Punto GPS   ━ Azul/Ámbar = Línea / Recorrido   ■ Verde = Polígono   ● Rojo = Ubicación OT',
        40,
        y,
      );
      y += 15;

      // Table of geoFeatures
      for (const gf of activity.geoFeatures) {
        const coords = gf.geometry?.coordinates ? JSON.stringify(gf.geometry.coordinates) : 'S/C';
        ensureSpace(24);
        doc.rect(40, y, contentW, 20).fillAndStroke('#ffffff', BORDER);
        doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(8).text(`${gf.code} (${gf.kind})`, 46, y + 6, { width: 110 });
        doc.fillColor(TEXT).font('Helvetica').fontSize(8).text(gf.label || 'Sin etiqueta', 160, y + 6, { width: 130 });
        doc.fillColor(MUTED).text(`±${gf.accuracy ? Math.round(gf.accuracy) : '?'}m`, 295, y + 6, { width: 45 });
        doc.text(coords.slice(0, 42) + (coords.length > 42 ? '…' : ''), 345, y + 6, { width: 205 });
        y += 20;
      }
      y += 12;
    }

    // ==================== 4. EVIDENCIAS DIGITALES ====================
    if (activity.evidences.length > 0) {
      drawSectionHeader(`4. Evidencias Digitales (${activity.evidences.length})`);

      // 4a. Photos grid
      if (photos.length > 0) {
        for (let i = 0; i < photos.length; i += 2) {
          ensureSpace(145);
          const pair = photos.slice(i, i + 2);
          pair.forEach((ph, colIdx) => {
            const px = 40 + colIdx * 262;
            doc.roundedRect(px, y, 250, 132, 4).fillAndStroke('#ffffff', BORDER);
            try {
              doc.image(ph.buffer, px + 8, y + 8, { fit: [234, 92], align: 'center', valign: 'center' });
            } catch {
              doc.fillColor(MUTED).fontSize(8).text('Imagen no compatible', px + 12, y + 45);
            }
            doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(7.5).text(ph.fileName.slice(0, 36), px + 8, y + 104, { width: 234 });
            doc.fillColor(MUTED).font('Helvetica').fontSize(7).text(
              `${new Date(ph.capturedAt).toLocaleString('es-CL')} · ${ph.uploader}`,
              px + 8,
              y + 116,
              { width: 234 },
            );
          });
          y += 142;
        }
      }

      // 4b. Signatures (vectorial SVG paths!)
      const sigs = activity.evidences.filter((e: any) => e.kind === 'SIGNATURE' && e.note);
      for (const sig of sigs) {
        let paths: string[] = [];
        try {
          const parsed = JSON.parse(sig.note);
          if (Array.isArray(parsed)) paths = parsed.filter((p) => typeof p === 'string');
        } catch {
          paths = [];
        }
        if (paths.length > 0) {
          ensureSpace(95);
          doc.roundedRect(40, y, 260, 82, 4).fillAndStroke('#ffffff', BORDER);
          doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(8).text(
            `Firma Digital (${sig.fileName || sig.uploadedBy?.name || 'Inspector'})`,
            48,
            y + 6,
          );
          doc.save();
          doc.translate(50, y + 18);
          doc.scale(0.55);
          for (const d of paths) {
            doc.path(d).lineWidth(3).strokeColor('#0f172a').stroke();
          }
          doc.restore();
          doc.fillColor(MUTED).font('Helvetica').fontSize(7).text(
            `Capturada: ${new Date(sig.capturedAt).toLocaleString('es-CL')}`,
            48,
            y + 68,
          );
          y += 92;
        }
      }

      // 4c. Audio transcripts & other files
      const others = activity.evidences.filter((e: any) => e.kind !== 'PHOTO' && e.kind !== 'SIGNATURE');
      for (const ev of others) {
        const desc = ev.transcript ? `Transcripción: "${ev.transcript}"` : ev.note || 'Archivo adjunto';
        const rowH = Math.max(28, doc.heightOfString(desc, { width: contentW - 20 }) + 18);
        ensureSpace(rowH + 4);
        doc.roundedRect(40, y, contentW, rowH, 4).fillAndStroke(BG_SOFT, BORDER);
        doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(8).text(
          `${ev.kind} · ${ev.fileName || ev.id.slice(0, 8)} · ${new Date(ev.capturedAt).toLocaleString('es-CL')} (${ev.uploadedBy?.name || 'Usuario'})`,
          48,
          y + 6,
          { width: contentW - 16 },
        );
        doc.fillColor(TEXT).font('Helvetica').fontSize(8).text(desc, 48, y + 18, { width: contentW - 16 });
        y += rowH + 5;
      }
      y += 8;
    }

    // ==================== 5. HISTORIAL Y TRAZABILIDAD ====================
    drawSectionHeader('5. Historial de Aprobaciones y Trazabilidad');
    if (activity.transitions.length === 0 && auditLogs.length === 0) {
      ensureSpace(20);
      doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(8.5).text('Sin movimientos registrados aún.', 40, y);
      y += 16;
    } else {
      for (const t of activity.transitions) {
        ensureSpace(28);
        doc.rect(40, y, 3, 20).fill('#7c3aed');
        doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(8).text(
          `${new Date(t.createdAt).toLocaleString('es-CL')} — ${t.label} (${t.fromStatus} -> ${t.toStatus})`,
          48,
          y,
        );
        doc.fillColor(MUTED).font('Helvetica').fontSize(7.5).text(
          `Usuario: ${t.user?.name || 'Sistema'}${t.comment ? ` · Obs: "${t.comment}"` : ''}`,
          48,
          y + 10,
        );
        y += 24;
      }
      for (const log of auditLogs.slice(-15)) {
        ensureSpace(22);
        doc.rect(40, y, 3, 14).fill(log.action.startsWith('delete') ? RED : PRIMARY);
        doc.fillColor(TEXT).font('Helvetica').fontSize(7.5).text(
          `${new Date(log.createdAt).toLocaleString('es-CL')} · [${log.entity}] ${log.action} · Usuario: ${log.userName || 'Sistema'}`,
          48,
          y + 2,
          { width: contentW - 12 },
        );
        y += 18;
      }
    }

    // ==================== PIE DE PÁGINA EN TODAS LAS PÁGINAS ====================
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const bottomY = doc.page.height - 38;
      doc.moveTo(40, bottomY - 6).lineTo(40 + contentW, bottomY - 6).lineWidth(0.7).strokeColor(BORDER).stroke();
      doc.fillColor(MUTED).font('Helvetica').fontSize(7).text(
        `Comisión Nacional de Riego (CNR) · Ley N° 19.799 · Verificación: ${code} · Página ${i + 1} de ${range.count}`,
        40,
        bottomY,
        { width: contentW, align: 'center' },
      );
    }

    doc.end();
  });
}
