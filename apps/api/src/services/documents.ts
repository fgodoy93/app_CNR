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

interface OsmMapResult {
  tiles: OsmMapTile[];
  zoom: number;
  startTileX: number;
  startTileY: number;
  cols: number;
  rows: number;
}

async function fetchOsmBackground(pts: [number, number][], cols = 4, rows = 2): Promise<OsmMapResult | null> {
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

  // Choose highest zoom (up to 16) where all points fit comfortably inside cols x rows tiles
  let zoom = 15;
  if (pts.length > 1 && (maxLng > minLng || maxLat > minLat)) {
    for (let z = 16; z >= 5; z--) {
      const spanX = lngToTileX(maxLng, z) - lngToTileX(minLng, z);
      const spanY = latToTileY(minLat, z) - latToTileY(maxLat, z);
      if (spanX <= cols * 0.72 && spanY <= rows * 0.72) {
        zoom = z;
        break;
      }
      zoom = z;
    }
  }

  const centerTileX = lngToTileX(cLng, zoom);
  const centerTileY = latToTileY(cLat, zoom);
  const startTileX = centerTileX - cols / 2;
  const startTileY = centerTileY - rows / 2;

  const firstTileX = Math.floor(startTileX);
  const firstTileY = Math.floor(startTileY);
  const lastTileX = Math.floor(startTileX + cols - 1e-6);
  const lastTileY = Math.floor(startTileY + rows - 1e-6);

  const coordsList: { tx: number; ty: number }[] = [];
  for (let ty = firstTileY; ty <= lastTileY; ty++) {
    for (let tx = firstTileX; tx <= lastTileX; tx++) {
      coordsList.push({ tx, ty });
    }
  }

  const tiles: OsmMapTile[] = [];
  try {
    await Promise.all(
      coordsList.map(async ({ tx, ty }) => {
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

  return tiles.length > 0 ? { tiles, zoom, startTileX, startTileY, cols, rows } : null;
}

function getSvgPathsBounds(paths: string[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  let found = false;
  const pairRe = /(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/g;
  for (const d of paths) {
    let m: RegExpExecArray | null;
    while ((m = pairRe.exec(d)) !== null) {
      const x = Number(m[1]);
      const y = Number(m[2]);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        found = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return found ? { minX, minY, maxX, maxY } : null;
}

function formatGeoSummary(gf: any): string {
  const g = gf.geometry;
  if (!g || !g.coordinates) return 'Sin coordenadas';
  if (g.type === 'Point' && Array.isArray(g.coordinates)) {
    const [lng, lat] = g.coordinates;
    return `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
  }
  if (g.type === 'LineString' && Array.isArray(g.coordinates)) {
    const pts = g.coordinates as [number, number][];
    if (pts.length === 0) return 'Línea vacía';
    return `${pts.length} vértices · Inicio ${Number(pts[0]![1]).toFixed(4)}, ${Number(pts[0]![0]).toFixed(4)}`;
  }
  if (g.type === 'Polygon' && Array.isArray(g.coordinates)) {
    const ring = (g.coordinates[0] || []) as [number, number][];
    if (ring.length === 0) return 'Polígono vacío';
    const avgLng = ring.reduce((s, p) => s + Number(p[0]), 0) / ring.length;
    const avgLat = ring.reduce((s, p) => s + Number(p[1]), 0) / ring.length;
    return `${ring.length} vértices · Centro ${avgLat.toFixed(4)}, ${avgLng.toFixed(4)}`;
  }
  return 'Geometría';
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
      parent: { select: { folio: true, title: true } },
      children: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
        include: {
          assignee: { select: { name: true } },
          type: { select: { name: true } },
          evidences: {
            where: { deletedAt: null },
            include: { uploadedBy: { select: { name: true } } },
            orderBy: { capturedAt: 'asc' },
          },
          comments: {
            include: { user: { select: { name: true } } },
            orderBy: { createdAt: 'asc' },
          },
          transitions: {
            where: { comment: { not: null } },
            include: { user: { select: { name: true } } },
            orderBy: { createdAt: 'asc' },
          },
        },
      },
      geoFeatures: { where: { deletedAt: null }, orderBy: { capturedAt: 'asc' } },
      evidences: {
        where: { deletedAt: null },
        include: { uploadedBy: { select: { name: true } } },
        orderBy: { capturedAt: 'asc' },
      },
      comments: {
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      },
      transitions: {
        include: { user: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!activity) throw notFound('Actividad no encontrada');

  const loadPhotoBuffers = async (evs: any[], limit = 6): Promise<LoadedPhoto[]> => {
    const out: LoadedPhoto[] = [];
    for (const ev of evs) {
      if (out.length >= limit) break;
      if (ev.kind === 'PHOTO' && ev.storageKey) {
        const mime = (ev.mimeType || '').toLowerCase();
        if (mime.includes('jpeg') || mime.includes('jpg') || mime.includes('png')) {
          try {
            const buf = await storage.get(ev.storageKey, ev.encrypted);
            out.push({
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
    return out;
  };

  const photos = await loadPhotoBuffers(activity.evidences, 6);
  const visitPhotos: Record<string, LoadedPhoto[]> = {};
  for (const child of activity.children ?? []) {
    visitPhotos[child.id] = await loadPhotoBuffers(child.evidences ?? [], 6);
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
    visitPhotos,
    osmBg,
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
  visitPhotos: Record<string, LoadedPhoto[]>;
  osmBg: OsmMapResult | null;
}): Promise<Buffer> {
  const { activity, kind, code, qrBuffer, logoBuf, photos, visitPhotos, osmBg } = ctx;
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

    const drawTwoColTable = (rows: { label: string; value: string }[]) => {
      rows.forEach((r, idx) => {
        doc.font('Helvetica-Bold').fontSize(8.5);
        const labelH = doc.heightOfString(r.label, { width: 192 });
        doc.font('Helvetica').fontSize(8.5);
        const valH = doc.heightOfString(r.value, { width: 292 });
        const rowH = Math.max(22, Math.max(labelH, valH) + 12);
        ensureSpace(rowH + 4);
        doc.rect(40, y, contentW, rowH).fillAndStroke(idx % 2 === 0 ? '#ffffff' : '#f8fafc', BORDER);
        doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8.5).text(r.label, 48, y + 6, { width: 192 });
        doc.fillColor(TEXT).font('Helvetica').fontSize(8.5).text(r.value, 250, y + 6, { width: 292 });
        y += rowH;
      });
      y += 12;
    };

    const drawPhotoGrid = (items: LoadedPhoto[]) => {
      for (let i = 0; i < items.length; i += 2) {
        ensureSpace(145);
        const pair = items.slice(i, i + 2);
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
    };

    const collectNotes = (act: any): { author: string; date: Date; text: string; tag?: string }[] => {
      const notes: { author: string; date: Date; text: string; tag?: string }[] = [];
      for (const c of act.comments ?? []) {
        if (c.body?.trim()) {
          notes.push({ author: c.user?.name || 'Personal', date: new Date(c.createdAt), text: c.body.trim() });
        }
      }
      for (const t of act.transitions ?? []) {
        if (t.comment?.trim()) {
          notes.push({
            author: t.user?.name || 'Personal',
            date: new Date(t.createdAt),
            text: t.comment.trim(),
            tag: `${t.label} (${t.toStatus})`,
          });
        }
      }
      return notes.sort((a, b) => a.date.getTime() - b.date.getTime());
    };

    const drawCommentsList = (notes: { author: string; date: Date; text: string; tag?: string }[]) => {
      for (const n of notes) {
        const hdr = `${n.author} · ${n.date.toLocaleString('es-CL')}${n.tag ? ` · ${n.tag}` : ''}`;
        doc.font('Helvetica').fontSize(8.5);
        const txtH = doc.heightOfString(n.text, { width: contentW - 22 });
        const boxH = Math.max(30, txtH + 22);
        ensureSpace(boxH + 6);
        doc.roundedRect(40, y, contentW, boxH, 4).fillAndStroke(BG_SOFT, BORDER);
        doc.rect(40, y, 3.5, boxH).fill(PRIMARY);
        doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(7.5).text(hdr, 50, y + 6, { width: contentW - 18 });
        doc.fillColor(TEXT).font('Helvetica').fontSize(8.5).text(n.text, 50, y + 17, { width: contentW - 18 });
        y += boxH + 6;
      }
    };

    // ==================== HEADER INSTITUCIONAL ====================
    drawTopStripe();
    y = 18;
    if (logoBuf) {
      try {
        doc.image(logoBuf, 40, y, { height: 46 });
      } catch {
        doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(14).text('CNR · Comisión Nacional de Riego', 40, y + 10);
      }
    } else {
      doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(14).text('CNR · Comisión Nacional de Riego', 40, y + 10);
    }

    // Título centrado entre logo y QR (calculando altura dinámica para evitar superposiciones)
    const hdrX = 140;
    const hdrW = 325;
    const docTitle =
      kind === 'VOUCHER' ? 'COMPROBANTE OFICIAL DE RECEPCIÓN' : 'INFORME TÉCNICO DE INSPECCIÓN EN TERRENO';
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(7.5).text('MINISTERIO DE AGRICULTURA · GOBIERNO DE CHILE', hdrX, y + 2, {
      width: hdrW,
      align: 'center',
    });
    doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(10.5);
    const titleH = doc.heightOfString(docTitle, { width: hdrW });
    doc.text(docTitle, hdrX, y + 14, { width: hdrW, align: 'center' });
    doc.fillColor(TEXT).font('Helvetica').fontSize(8).text(
      `Folio: ${activity.folio}  |  Emisión: ${new Date().toLocaleString('es-CL')}`,
      hdrX,
      y + 18 + titleH,
      { width: hdrW, align: 'center' },
    );

    doc.image(qrBuffer, 483, y - 2, { width: 66 });
    doc.fillColor(MUTED).font('Helvetica').fontSize(6).text(`Verificación: ${code}`, 466, y + 66, { width: 100, align: 'center' });

    y = Math.max(102, y + 36 + titleH);
    doc.moveTo(40, y).lineTo(40 + contentW, y).lineWidth(1).strokeColor(PRIMARY).stroke();
    y += 12;

    // ==================== 1. FICHA GENERAL OT ====================
    drawSectionHeader('1. Información General de la Orden de Trabajo');
    const createdTxt = `${activity.createdBy?.name || 'Sistema'} (${new Date(activity.createdAt).toLocaleString('es-CL')})`;
    const locTxt = activity.address
      ? `${activity.address}${typeof activity.lat === 'number' ? ` (${activity.lat.toFixed(5)}, ${activity.lng.toFixed(5)})` : ''}`
      : typeof activity.lat === 'number'
        ? `${activity.lat.toFixed(5)}, ${activity.lng.toFixed(5)}`
        : 'Sin dirección registrada';

    const generalRows: { label: string; value: string }[] = [];
    if (activity.parent) {
      generalRows.push({ label: 'OT Principal', value: `${activity.parent.folio} — ${activity.parent.title}` });
    }
    generalRows.push(
      { label: 'Título', value: String(activity.title || 'Sin título') },
      { label: 'Proceso', value: String(activity.type?.name || 'N/A') },
      { label: 'Unidad', value: String(activity.unit?.name || 'General') },
      { label: 'Estado', value: `${activity.status} (${activity.progress ?? 0}%)` },
      { label: 'Prioridad', value: String(activity.priority || 'MEDIA') },
      { label: 'Creado por', value: createdTxt },
      { label: 'Asignado a', value: String(activity.assignee?.name || 'Sin asignar') },
      { label: 'Ubicación', value: locTxt },
    );
    if (activity.description) {
      generalRows.push({ label: 'Descripción', value: String(activity.description) });
    }
    drawTwoColTable(generalRows);

    // ==================== 2. FORMULARIO DIGITAL ====================
    const formFields: any[] = activity.formVersion?.definition?.fields ?? [];
    const formData: Record<string, unknown> = (activity.data as Record<string, unknown>) || {};
    const answerFields = formFields.filter((f) => f.type !== 'section');

    if (answerFields.length > 0) {
      drawSectionHeader('2. Respuestas del Formulario Digital en Terreno');
      drawTwoColTable(
        answerFields.map((f) => ({
          label: String(f.label || f.key || ''),
          value: formatFormValue(f, formData[f.key]),
        })),
      );
    }

    // ==================== 3. MAPA DE UBICACIÓN Y TRAZADO ====================
    const pts = extractAllPositions(activity);
    if (pts.length > 0 || activity.geoFeatures.length > 0) {
      const mapX = 40;
      const mapW = contentW; // 515
      const mapH = osmBg ? Math.round((mapW / osmBg.cols) * osmBg.rows) : 230;
      ensureSpace(mapH + 85);
      drawSectionHeader('3. Mapa de Ubicación y Trazado Geográfico');

      doc.save();
      doc.rect(mapX, y, mapW, mapH).clip();
      doc.rect(mapX, y, mapW, mapH).fill('#e8f0ec');

      // Project helper
      let toCanvas: (lng: number, lat: number) => [number, number];
      if (osmBg) {
        const tilePx = mapW / osmBg.cols;
        for (const t of osmBg.tiles) {
          const dx = t.tileX - osmBg.startTileX;
          const dy = t.tileY - osmBg.startTileY;
          try {
            doc.image(t.buffer, mapX + dx * tilePx, y + dy * tilePx, { width: tilePx + 0.6, height: tilePx + 0.6 });
          } catch {
            // ignore tile render error
          }
        }
        toCanvas = (lng: number, lat: number) => {
          const tx = lngToTileX(lng, osmBg.zoom);
          const ty = latToTileY(lat, osmBg.zoom);
          return [mapX + (tx - osmBg.startTileX) * tilePx, y + (ty - osmBg.startTileY) * tilePx];
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

      // Map border & vectorial legend (sin caracteres Unicode rotos)
      doc.rect(mapX, y, mapW, mapH).lineWidth(1).strokeColor(BORDER).stroke();
      y += mapH + 7;

      let lx = 44;
      const lyCenter = y + 4;
      doc.circle(lx, lyCenter, 3.5).fill(PRIMARY);
      doc.fillColor(MUTED).font('Helvetica').fontSize(7.5).text('Punto GPS', lx + 7, y);
      lx += 62;
      doc.moveTo(lx, lyCenter).lineTo(lx + 12, lyCenter).lineWidth(2.2).strokeColor(PRIMARY).stroke();
      doc.fillColor(MUTED).text('Línea /', lx + 16, y);
      lx += 48;
      doc.moveTo(lx, lyCenter).lineTo(lx + 12, lyCenter).lineWidth(2.2).strokeColor('#d97706').stroke();
      doc.fillColor(MUTED).text('Recorrido', lx + 16, y);
      lx += 58;
      doc.rect(lx, y + 1, 7, 7).fill(GREEN);
      doc.fillColor(MUTED).text('Polígono', lx + 11, y);
      lx += 54;
      doc.circle(lx + 3, lyCenter, 3.5).fill(RED);
      doc.fillColor(MUTED).text('Ubicación OT', lx + 10, y);
      y += 16;

      // Table of geoFeatures
      for (const gf of activity.geoFeatures) {
        const labelStr = gf.label || 'Sin etiqueta';
        const coordSummary = formatGeoSummary(gf);
        doc.font('Helvetica').fontSize(8);
        const labelH = doc.heightOfString(labelStr, { width: 150 });
        const coordH = doc.heightOfString(coordSummary, { width: 185 });
        const rowH = Math.max(20, Math.max(labelH, coordH) + 10);
        ensureSpace(rowH + 4);
        doc.rect(40, y, contentW, rowH).fillAndStroke('#ffffff', BORDER);
        doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(8).text(`${gf.code} (${gf.kind})`, 46, y + 5, { width: 112 });
        doc.fillColor(TEXT).font('Helvetica').fontSize(8).text(labelStr, 162, y + 5, { width: 150 });
        doc.fillColor(MUTED).text(`±${gf.accuracy ? Math.round(gf.accuracy) : '?'}m`, 316, y + 5, { width: 42 });
        doc.text(coordSummary, 362, y + 5, { width: 185 });
        y += rowH;
      }
      y += 12;
    }

    // ==================== 4. EVIDENCIAS DIGITALES ====================
    if (activity.evidences.length > 0) {
      drawSectionHeader(`4. Evidencias Digitales (${activity.evidences.length})`);

      // 4a. Photos grid
      if (photos.length > 0) {
        drawPhotoGrid(photos);
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
          ensureSpace(105);
          const cardW = 280;
          const cardH = 92;
          doc.roundedRect(40, y, cardW, cardH, 4).fillAndStroke('#ffffff', BORDER);
          doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(8).text(
            `Firma Digital (${sig.fileName || sig.uploadedBy?.name || 'Inspector'})`,
            48,
            y + 7,
            { width: cardW - 16 },
          );

          const sigBoxX = 48;
          const sigBoxY = y + 22;
          const sigBoxW = cardW - 16;
          const sigBoxH = 48;
          const bounds = getSvgPathsBounds(paths);

          doc.save();
          doc.rect(sigBoxX, sigBoxY, sigBoxW, sigBoxH).clip();
          if (bounds) {
            const spanX = Math.max(10, bounds.maxX - bounds.minX);
            const spanY = Math.max(10, bounds.maxY - bounds.minY);
            const pad = 4;
            const s = Math.min((sigBoxW - pad * 2) / spanX, (sigBoxH - pad * 2) / spanY);
            const drawW = spanX * s;
            const drawH = spanY * s;
            const offsetX = sigBoxX + (sigBoxW - drawW) / 2;
            const offsetY = sigBoxY + (sigBoxH - drawH) / 2;
            doc.translate(offsetX, offsetY);
            doc.scale(s);
            doc.translate(-bounds.minX, -bounds.minY);
            for (const d of paths) {
              doc.path(d).lineWidth(Math.max(1.2, 1.8 / s)).strokeColor('#0f172a').stroke();
            }
          }
          doc.restore();

          doc.fillColor(MUTED).font('Helvetica').fontSize(7).text(
            `Capturada: ${new Date(sig.capturedAt).toLocaleString('es-CL')}`,
            48,
            y + 76,
            { width: cardW - 16 },
          );
          y += cardH + 10;
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

    // ==================== 5. COMENTARIOS DEL PERSONAL ====================
    const mainNotes = collectNotes(activity);
    if (mainNotes.length > 0) {
      drawSectionHeader(`5. Comentarios y Observaciones del Personal (${mainNotes.length})`);
      drawCommentsList(mainNotes);
      y += 6;
    }

    // ==================== 6. VISITAS TÉCNICAS ASOCIADAS ====================
    if (Array.isArray(activity.children) && activity.children.length > 0) {
      const secNum = mainNotes.length > 0 ? 6 : 5;
      drawSectionHeader(`${secNum}. Visitas Técnicas Asociadas (${activity.children.length})`);
      for (const v of activity.children) {
        const vNotes = collectNotes(v);
        const vPhotos = visitPhotos[v.id] ?? [];
        const vHeader = `${v.folio} · ${v.title}`;
        const vMeta = `Estado: ${v.status} · Inspector: ${v.assignee?.name || 'Sin asignar'} · Fecha: ${new Date(v.scheduledAt || v.createdAt).toLocaleDateString('es-CL')}`;

        ensureSpace(46);
        doc.roundedRect(40, y, contentW, 34, 4).fillAndStroke('#eef6fc', BORDER);
        doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(9).text(vHeader, 48, y + 6, { width: contentW - 16 });
        doc.fillColor(MUTED).font('Helvetica').fontSize(7.5).text(vMeta, 48, y + 19, { width: contentW - 16 });
        y += 40;

        if (v.description) {
          doc.font('Helvetica').fontSize(8);
          const dh = doc.heightOfString(v.description, { width: contentW - 16 });
          ensureSpace(dh + 10);
          doc.fillColor(TEXT).text(v.description, 48, y, { width: contentW - 16 });
          y += dh + 6;
        }

        if (vNotes.length > 0) {
          drawCommentsList(vNotes);
        }

        if (vPhotos.length > 0) {
          drawPhotoGrid(vPhotos);
        }

        if (vNotes.length === 0 && vPhotos.length === 0 && !v.description) {
          ensureSpace(16);
          doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(7.5).text('Sin observaciones ni fotografías adjuntas en esta visita aún.', 48, y);
          y += 14;
        }
        y += 6;
      }
    }

    // ==================== PIE DE PÁGINA EN TODAS LAS PÁGINAS ====================
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      // Evita que PDFKit agregue páginas en blanco al escribir debajo del margen inferior
      doc.page.margins.bottom = 0;
      const bottomY = doc.page.height - 32;
      doc.moveTo(40, bottomY - 6).lineTo(40 + contentW, bottomY - 6).lineWidth(0.7).strokeColor(BORDER).stroke();
      doc.fillColor(MUTED).font('Helvetica').fontSize(7).text(
        `Comisión Nacional de Riego (CNR) · Ley N° 19.799 · Verificación: ${code} · Página ${i + 1} de ${range.count}`,
        40,
        bottomY,
        { width: contentW, align: 'center', lineBreak: false },
      );
    }

    doc.end();
  });
}
