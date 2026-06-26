/**
 * @nxr/io — typed read accessors.
 *
 * Canonical readers over the read/meta/attrs primitives. Paths and dtypes
 * follow schema/nxr.manifold.schema.json + nxr.field.schema.json. Missing
 * OPTIONAL components return null; required-but-absent surfaces as the
 * underlying read error.
 */
import { read, meta } from './read.js';
import { attrs } from './attrs.js';
import type { Store } from './store.js';
import type { TypedArray } from './types.js';

export interface ManifoldData {
  vertices: Float64Array; faces: Int32Array; normals: Float64Array | null; nV: number; nF: number;
  transform: Float64Array | null; units: string | null;
}

export async function readManifold(store: Store): Promise<ManifoldData> {
  const vertices = await read<Float64Array>(store, 'manifold/mesh/vertices');
  const faces = await read<Int32Array>(store, 'manifold/mesh/faces');
  let normals: Float64Array | null = null;
  try { normals = await read<Float64Array>(store, 'manifold/geometry/vertex_normals'); } catch { /* optional */ }
  let transform: Float64Array | null = null;
  let units: string | null = null;
  try {
    const a = (await attrs.read(store, 'manifold')) as Record<string, unknown>;
    if (Array.isArray(a.world_transform) && a.world_transform.length === 16) transform = Float64Array.from(a.world_transform as number[]);
    if (typeof a.units === 'string') units = a.units;
  } catch { /* optional */ }
  return { vertices, faces, normals, nV: vertices.length / 3, nF: faces.length / 3, transform, units };
}

export interface EigenData { eigenvalues: Float64Array; eigenvectors: Float64Array; K: number; nV: number; }

export async function readEigenmodes(store: Store): Promise<EigenData | null> {
  try {
    const eigenvalues = await read<Float64Array>(store, 'manifold/eigenmodes/scalar/eigenvalues');
    const eigenvectors = await read<Float64Array>(store, 'manifold/eigenmodes/scalar/eigenvectors');
    const K = eigenvalues.length;
    return { eigenvalues, eigenvectors, K, nV: K > 0 ? eigenvectors.length / K : 0 };
  } catch { return null; }
}

export async function readDiagonalOperator(store: Store, name: string): Promise<Float64Array | null> {
  try { return await read<Float64Array>(store, `manifold/operators/${name}`); } catch { return null; }
}

export interface FieldDescriptor { name: string; kind: string; domain: string; units?: string; range_hint?: number[]; }

export async function listFields(store: Store): Promise<FieldDescriptor[]> {
  let names: string[] = [];
  try {
    const fg = (await attrs.read(store, 'field')) as Record<string, unknown>;
    if (Array.isArray(fg.names)) names = fg.names as string[];
  } catch { return []; }
  const out: FieldDescriptor[] = [];
  for (const name of names) {
    try {
      const a = (await attrs.read(store, `field/${name}`)) as Record<string, unknown>;
      out.push({
        name,
        kind: String(a.kind ?? 'scalar'),
        domain: String(a.domain ?? 'vertex'),
        units: typeof a.units === 'string' ? a.units : undefined,
        range_hint: Array.isArray(a.range_hint) ? (a.range_hint as number[]) : undefined,
      });
    } catch {
      console.warn(`[nxr/io] listFields: skipping "${name}" — field group unreadable`);
    }
  }
  return out;
}

export interface FieldData { values: TypedArray; kind: string; domain: string; shape: number[]; }

export async function readField(store: Store, name: string): Promise<FieldData> {
  const a = (await attrs.read(store, `field/${name}`)) as Record<string, unknown>;
  const m = await meta(store, `field/${name}/values`);
  const values = await read(store, `field/${name}/values`);
  return { values, kind: String(a.kind ?? 'scalar'), domain: String(a.domain ?? 'vertex'), shape: m.shape };
}
