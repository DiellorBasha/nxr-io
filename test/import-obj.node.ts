/** Round-trip test: importObj writes a store the accessors read back. Run: npm run test:import */
import { promises as fs, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { importObj } from '../src/import/obj.js';
import { openLocal } from '../src/store.js';
import { readManifold, listFields, readField } from '../src/accessors.js';

let failures = 0;
const check = (cond: boolean, label: string): void => {
  if (!cond) { console.error(`  FAIL ${label}`); failures++; }
};

async function main(): Promise<void> {
  const dir = path.join(os.tmpdir(), `nxr-obj-${process.pid}`);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });

  const objPath = path.join(dir, 'tri.obj');
  // faces span all four OBJ token syntaxes: plain (1), v/vt (2/2), v//vn (3//3), v/vt/vn (1/1/1)
  writeFileSync(objPath, 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2/2 3//3\nf 1/1/1 3 2\n');
  const fieldsPath = path.join(dir, 'tri.fields.json');
  writeFileSync(fieldsPath, JSON.stringify({ scalar: [{ name: 'height', domain: 'vertex', values: [0.1, 0.2, 0.3] }] }));
  const out = path.join(dir, 'tri.nxr.zarr');

  const res = await importObj(objPath, { out, fields: fieldsPath, subject: 'tri' });
  check(res.nV === 3 && res.nF === 2, 'import counts');
  check(res.fields.length === 1 && res.fields[0] === 'height', 'import fields');

  const store = await openLocal(out);
  const m = await readManifold(store);
  check(m.nV === 3 && m.faces[0] === 0 && m.faces[1] === 1 && m.faces[2] === 2, 'roundtrip faces 0-based');
  check(Math.abs(m.vertices[3] - 1) < 1e-9, 'roundtrip vertex x of v2');
  const fl = await listFields(store);
  check(fl.length === 1 && fl[0].name === 'height', 'roundtrip listFields');
  const fv = await readField(store, 'height');
  check(Math.abs((fv.values[2] as number) - 0.3) < 1e-9, 'roundtrip field value');

  console.log(failures === 0 ? '✓ importObj round-trips through accessors' : `✗ ${failures} failures`);
  process.exit(failures ? 1 : 0);
}
main();
