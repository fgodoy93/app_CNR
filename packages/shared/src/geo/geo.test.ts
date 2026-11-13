import { describe, expect, it } from 'vitest';
import { closeRing, haversine, ringArea, toCSV, toGeoJSON, toKML, toWKT, validateGeometry, type GeoFeatureRecord } from './index';

const pt: GeoFeatureRecord = {
  id: 'a1', code: 'PT-000001', kind: 'POINT', label: 'Compuerta <1>', status: 'OK',
  geometry: { type: 'Point', coordinates: [-70.65, -33.45] }, accuracy: 4.2, activityFolio: 'INS-2026-000001',
};
const poly: GeoFeatureRecord = {
  id: 'a2', code: 'PG-000001', kind: 'POLYGON',
  geometry: { type: 'Polygon', coordinates: [[[0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001], [0, 0]]] },
};

describe('geometry validation', () => {
  it('validates points and kind mismatch', () => {
    expect(validateGeometry('POINT', pt.geometry)).toBeUndefined();
    expect(validateGeometry('LINE', pt.geometry)).toMatch(/no corresponde/);
    expect(validateGeometry('POINT', { type: 'Point', coordinates: [200, 0] })).toMatch(/inválidas/);
  });
  it('requires closed polygons', () => {
    expect(validateGeometry('POLYGON', poly.geometry)).toBeUndefined();
    expect(validateGeometry('POLYGON', { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] })).toMatch(/cerrado/);
  });
  it('closeRing closes open rings', () => {
    expect(closeRing([[0, 0], [1, 0], [1, 1]])).toHaveLength(4);
  });
});

describe('measurements', () => {
  it('haversine ~111km per degree of latitude', () => {
    expect(haversine([0, 0], [0, 1]) / 1000).toBeCloseTo(111.2, 0);
  });
  it('ring area ~ 12,364 m² for 0.001° square at equator', () => {
    expect(ringArea((poly.geometry as { coordinates: [number, number][][] }).coordinates[0]!)).toBeGreaterThan(12000);
    expect(ringArea((poly.geometry as { coordinates: [number, number][][] }).coordinates[0]!)).toBeLessThan(12800);
  });
});

describe('exports', () => {
  it('GeoJSON FeatureCollection', () => {
    const g = toGeoJSON([pt, poly]);
    expect(g.type).toBe('FeatureCollection');
    expect(g.features[0]!.properties.codigo).toBe('PT-000001');
    expect(g.features[1]!.properties.areaM2).toBeGreaterThan(0);
  });
  it('KML escapes XML and includes geometries', () => {
    const k = toKML([pt, poly]);
    expect(k).toContain('<kml');
    expect(k).toContain('Compuerta &lt;1&gt;');
    expect(k).toContain('<Point><coordinates>-70.65,-33.45,0</coordinates></Point>');
    expect(k).toContain('<outerBoundaryIs>');
  });
  it('CSV includes lat/lng and WKT', () => {
    const c = toCSV([pt]);
    const lines = c.replace('\uFEFF', '').split('\r\n');
    expect(lines[0]).toContain('latitud');
    expect(lines[1]).toContain('-33.45,-70.65');
    expect(lines[1]).toContain('POINT (-70.65 -33.45)');
  });
  it('WKT for polygons', () => {
    expect(toWKT(poly.geometry)).toMatch(/^POLYGON \(\(0 0, /);
  });
});
