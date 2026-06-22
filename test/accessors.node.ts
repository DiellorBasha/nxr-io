/** Node test for the typed read accessors. Run: npm run test:accessors */
import FileSystemStore from '@zarrita/storage/fs';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { create } from '../src/store.js';
import { attrs } from '../src/attrs.js';
import { write } from '../src/write.js';
import { readManifold, readEigenmodes, readDiagonalOperator, listFields, readField } from '../src/accessors.js';

let failures = 0;
const check = (cond: boolean, label: string): void => {
  if (!cond) { console.error(`  FAIL ${label}`); failures++; }
};

async function main(): Promise<void> {
  const dir = path.join(os.tmpdir(), `nxr-acc-${process.pid}`);
  await fs.rm(dir, { recursive: true, force: true });
  const store = create(new FileSystemStore(dir), dir);

  await attrs.write(store, '', { schema: 'nxr.subject@1.0', subject: 't' });
  await attrs.write(store, 'manifold', { schema: 'nxr.manifold@1.0', nV: 4, nF: 2 });
  await write(store, 'manifold/mesh/vertices', new Float64Array([0,0,0, 1,0,0, 0,1,0, 0,0,1]), { shape: [4,3], dtype: 'float64' });
  await write(store, 'manifold/mesh/faces', new Int32Array([0,1,2, 0,2,3]), { shape: [2,3], dtype: 'int32' });

  const m = await readManifold(store);
  check(m.nV === 4 && m.nF === 2, 'manifold counts');
  check(m.faces[5] === 3, 'faces preserved (0-based)');
  check(m.normals === null, 'normals optional -> null when absent');

  check((await readDiagonalOperator(store, 'mass')) === null, 'mass absent -> null');
  await write(store, 'manifold/operators/mass', new Float64Array([1,1,1,1]), { shape: [4], dtype: 'float64' });
  const mass = await readDiagonalOperator(store, 'mass');
  check(mass !== null && mass.length === 4, 'mass present -> [V]');

  check((await readEigenmodes(store)) === null, 'eigenmodes absent -> null');
  await write(store, 'manifold/eigenmodes/scalar/eigenvalues', new Float64Array([0,1,2]), { shape: [3], dtype: 'float64' });
  await write(store, 'manifold/eigenmodes/scalar/eigenvectors', new Float64Array(4*3), { shape: [4,3], dtype: 'float64' });
  const e = await readEigenmodes(store);
  check(e !== null && e.K === 3 && e.nV === 4, 'eigenmodes K/nV');

  check((await listFields(store)).length === 0, 'no fields -> empty');
  await attrs.write(store, 'field/height', { schema: 'nxr.field@1.0', manifold_ref: './manifold', kind: 'scalar', domain: 'vertex' });
  await write(store, 'field/height/values', new Float64Array([1,2,3,4]), { shape: [4], dtype: 'float64' });
  await attrs.write(store, 'field', { names: ['height'] });
  const fl = await listFields(store);
  check(fl.length === 1 && fl[0].name === 'height' && fl[0].kind === 'scalar', 'listFields');
  // A stale name with no field/<name> group must be skipped, not throw.
  await attrs.write(store, 'field', { names: ['height', 'ghost'] });
  const fl2 = await listFields(store);
  check(fl2.length === 1 && fl2[0].name === 'height', 'listFields skips stale names');
  const fv = await readField(store, 'height');
  check(fv.values.length === 4 && fv.shape[0] === 4 && fv.domain === 'vertex', 'readField');

  console.log(failures === 0 ? '✓ accessors read canonical data' : `✗ ${failures} failures`);
  process.exit(failures ? 1 : 0);
}
main();
