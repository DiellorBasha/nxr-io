/**
 * @nxr/io — OBJ import.
 *
 * Parse a Wavefront OBJ (+ optional <name>.fields.json sidecar) into a
 * canonical nxr.subject@1.0 / nxr.manifold@1.0 store. First member of the
 * nxr-io import surface; the basis for future Brainstorm / FreeSurfer importers.
 */
import { readFileSync } from 'node:fs';
import { createLocal } from '../store.js';
import { write } from '../write.js';
import { attrs } from '../attrs.js';

export interface ImportObjOptions { out: string; fields?: string; subject?: string; }
export interface ImportObjResult { storePath: string; nV: number; nF: number; fields: string[]; }

interface ScalarFieldJson { name: string; domain: string; values: number[]; }

export async function importObj(objPath: string, opts: ImportObjOptions): Promise<ImportObjResult> {
  const text = readFileSync(objPath, 'utf8');
  const verts: number[] = [];
  const faces: number[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('v ')) {
      const p = line.split(/\s+/);
      verts.push(parseFloat(p[1]), parseFloat(p[2]), parseFloat(p[3]));
    } else if (line.startsWith('f ')) {
      const p = line.split(/\s+/).slice(1);
      if (p.length !== 3) throw new Error(`[importObj] non-triangular face in ${objPath}: "${line}"`);
      // Face token is v | v/vt | v//vn | v/vt/vn — take the vertex index, 1-based -> 0-based.
      const idx = p.map((tok) => parseInt(tok.split('/')[0], 10) - 1);
      faces.push(idx[0], idx[1], idx[2]);
    }
  }
  if (verts.length === 0) throw new Error(`[importObj] no vertices in ${objPath}`);
  const nV = verts.length / 3;
  const nF = faces.length / 3;

  const store = createLocal(opts.out);
  await attrs.write(store, '', { schema: 'nxr.subject@1.0', subject: opts.subject ?? 'unknown' });
  await attrs.write(store, 'manifold', { schema: 'nxr.manifold@1.0', nV, nF });
  await write(store, 'manifold/mesh/vertices', new Float64Array(verts), { shape: [nV, 3], dtype: 'float64' });
  await write(store, 'manifold/mesh/faces', new Int32Array(faces), { shape: [nF, 3], dtype: 'int32' });

  const fieldNames: string[] = [];
  if (opts.fields) {
    const fj = JSON.parse(readFileSync(opts.fields, 'utf8')) as { scalar?: ScalarFieldJson[] };
    for (const sc of fj.scalar ?? []) {
      if (sc.domain !== 'vertex') continue;
      if (sc.values.length !== nV) {
        throw new Error(`[importObj] field "${sc.name}" length ${sc.values.length} != nV ${nV}`);
      }
      await attrs.write(store, `field/${sc.name}`, {
        schema: 'nxr.field@1.0', manifold_ref: './manifold', kind: 'scalar', domain: 'vertex',
      });
      await write(store, `field/${sc.name}/values`, new Float64Array(sc.values), { shape: [nV], dtype: 'float64' });
      fieldNames.push(sc.name);
    }
    await attrs.write(store, 'field', { names: fieldNames });
  }

  return { storePath: opts.out, nV, nF, fields: fieldNames };
}
