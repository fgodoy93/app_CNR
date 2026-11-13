export type Position = [lng: number, lat: number] | [lng: number, lat: number, alt: number];

export type GeoKind = 'POINT' | 'LINE' | 'POLYGON' | 'TRACK';

export type Geometry =
  | { type: 'Point'; coordinates: Position }
  | { type: 'LineString'; coordinates: Position[] }
  | { type: 'Polygon'; coordinates: Position[][] };

export interface GeoFeatureRecord {
  id: string;
  code: string;
  kind: GeoKind;
  geometry: Geometry;
  label?: string | null;
  description?: string | null;
  status?: string | null;
  observations?: string | null;
  accuracy?: number | null;
  capturedAt?: string | Date | null;
  capturedBy?: string | null;
  activityFolio?: string | null;
  activityTitle?: string | null;
  evidenceCount?: number;
  evidenceUrls?: string[];
}

export const GEO_KIND_GEOMETRY: Record<GeoKind, Geometry['type']> = {
  POINT: 'Point',
  LINE: 'LineString',
  TRACK: 'LineString',
  POLYGON: 'Polygon',
};

export function isValidPosition(p: unknown): p is Position {
  if (!Array.isArray(p) || p.length < 2 || p.length > 3) return false;
  const [lng, lat] = p as number[];
  return (
    typeof lng === 'number' && typeof lat === 'number' &&
    Number.isFinite(lng) && Number.isFinite(lat) &&
    lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90
  );
}

export function validateGeometry(kind: GeoKind, g: Geometry): string | undefined {
  if (g.type !== GEO_KIND_GEOMETRY[kind]) return `Geometría ${g.type} no corresponde al tipo ${kind}`;
  if (g.type === 'Point') return isValidPosition(g.coordinates) ? undefined : 'Coordenadas inválidas';
  if (g.type === 'LineString') {
    if (g.coordinates.length < 2) return 'Una línea requiere al menos 2 puntos';
    return g.coordinates.every(isValidPosition) ? undefined : 'Coordenadas inválidas';
  }
  const ring = g.coordinates[0];
  if (!ring || ring.length < 4) return 'Un polígono requiere al menos 3 vértices (anillo cerrado)';
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) return 'El anillo del polígono debe estar cerrado';
  return g.coordinates.every((r) => r.every(isValidPosition)) ? undefined : 'Coordenadas inválidas';
}

/** Closes an open ring by repeating the first vertex. */
export function closeRing(points: Position[]): Position[] {
  if (points.length === 0) return points;
  const f = points[0]!;
  const l = points[points.length - 1]!;
  return f[0] === l[0] && f[1] === l[1] ? points : [...points, f];
}

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversine(a: Position, b: Position): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function lineLength(coords: Position[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += haversine(coords[i - 1]!, coords[i]!);
  return total;
}

/** Approximate geodesic area (m²) of a ring using the spherical excess formula. */
export function ringArea(ring: Position[]): number {
  if (ring.length < 4) return 0;
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const p1 = ring[i]!;
    const p2 = ring[i + 1]!;
    area += rad(p2[0] - p1[0]) * (2 + Math.sin(rad(p1[1])) + Math.sin(rad(p2[1])));
  }
  return Math.abs((area * R * R) / 2);
}

export function measure(g: Geometry): { lengthM?: number; areaM2?: number } {
  if (g.type === 'LineString') return { lengthM: lineLength(g.coordinates) };
  if (g.type === 'Polygon') return { areaM2: ringArea(g.coordinates[0] ?? []), lengthM: lineLength(g.coordinates[0] ?? []) };
  return {};
}

function props(f: GeoFeatureRecord) {
  return {
    id: f.id,
    codigo: f.code,
    tipo: f.kind,
    nombre: f.label ?? '',
    descripcion: f.description ?? '',
    estado: f.status ?? '',
    observaciones: f.observations ?? '',
    precision_m: f.accuracy ?? null,
    fecha_captura: f.capturedAt ? new Date(f.capturedAt).toISOString() : null,
    capturado_por: f.capturedBy ?? '',
    actividad_folio: f.activityFolio ?? '',
    actividad: f.activityTitle ?? '',
    evidencias: f.evidenceCount ?? 0,
    evidencias_url: (f.evidenceUrls ?? []).join(' '),
    ...measure(f.geometry),
  };
}

export function toGeoJSON(features: GeoFeatureRecord[]) {
  return {
    type: 'FeatureCollection' as const,
    features: features.map((f) => ({ type: 'Feature' as const, id: f.id, geometry: f.geometry, properties: props(f) })),
  };
}

function xmlEscape(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
}

const coordStr = (c: Position[]) => c.map((p) => `${p[0]},${p[1]},${p[2] ?? 0}`).join(' ');

export function toKML(features: GeoFeatureRecord[], name = 'Exportación TerrenoCNR'): string {
  const placemarks = features
    .map((f) => {
      const p = props(f);
      const data = Object.entries(p)
        .map(([k, v]) => `<Data name="${xmlEscape(k)}"><value>${xmlEscape(String(v ?? ''))}</value></Data>`)
        .join('');
      let geom: string;
      if (f.geometry.type === 'Point') geom = `<Point><coordinates>${coordStr([f.geometry.coordinates])}</coordinates></Point>`;
      else if (f.geometry.type === 'LineString') geom = `<LineString><tessellate>1</tessellate><coordinates>${coordStr(f.geometry.coordinates)}</coordinates></LineString>`;
      else
        geom = `<Polygon>${f.geometry.coordinates
          .map((ring, i) => `<${i === 0 ? 'outerBoundaryIs' : 'innerBoundaryIs'}><LinearRing><coordinates>${coordStr(ring)}</coordinates></LinearRing></${i === 0 ? 'outerBoundaryIs' : 'innerBoundaryIs'}>`)
          .join('')}</Polygon>`;
      const title = `${f.code}${f.label ? ' - ' + f.label : ''}`;
      return `<Placemark id="${xmlEscape(f.id)}"><name>${xmlEscape(title)}</name><description>${xmlEscape(f.description ?? '')}</description><ExtendedData>${data}</ExtendedData>${geom}</Placemark>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xmlEscape(name)}</name>\n${placemarks}\n</Document></kml>`;
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v !== 'number' && !/^-?\d+(\.\d+)?$/.test(s) && /^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV with WKT geometry and lat/lng of the representative point (first vertex). */
export function toCSV(features: GeoFeatureRecord[]): string {
  const header = ['id', 'codigo', 'tipo', 'nombre', 'descripcion', 'estado', 'observaciones', 'latitud', 'longitud', 'precision_m', 'fecha_captura', 'capturado_por', 'actividad_folio', 'evidencias', 'longitud_m', 'area_m2', 'wkt'];
  const rows = features.map((f) => {
    const p = props(f);
    const first = f.geometry.type === 'Point' ? f.geometry.coordinates : f.geometry.type === 'LineString' ? f.geometry.coordinates[0] : f.geometry.coordinates[0]?.[0];
    return [p.id, p.codigo, p.tipo, p.nombre, p.descripcion, p.estado, p.observaciones, first?.[1], first?.[0], p.precision_m, p.fecha_captura, p.capturado_por, p.actividad_folio, p.evidencias, p.lengthM?.toFixed(2), p.areaM2?.toFixed(2), toWKT(f.geometry)]
      .map(csvCell)
      .join(',');
  });
  return '\uFEFF' + [header.join(','), ...rows].join('\r\n');
}

export function toWKT(g: Geometry): string {
  const pt = (p: Position) => `${p[0]} ${p[1]}`;
  if (g.type === 'Point') return `POINT (${pt(g.coordinates)})`;
  if (g.type === 'LineString') return `LINESTRING (${g.coordinates.map(pt).join(', ')})`;
  return `POLYGON (${g.coordinates.map((r) => `(${r.map(pt).join(', ')})`).join(', ')})`;
}
