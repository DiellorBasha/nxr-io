/**
 * Node test for the TS schema validator (parity with the C++ test_schema).
 * Writes small manifold stores with the TS writer, then validates (metadata-only).
 *
 * Run: npm run test:schema
 */
import FileSystemStore from '@zarrita/storage/fs';
import { promises as fs, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { create } from '../src/store.js';
import { attrs } from '../src/attrs.js';
import { write } from '../src/write.js';
import { validateStore, readSchemaTag } from '../src/schema.js';
import type { Registry, Store } from '../src/index.js';

function loadRegistry(): Registry {
  const sdir = new URL('../schema/', import.meta.url);
  const reg = JSON.parse(readFileSync(new URL('registry.json', sdir), 'utf8')).registry as Record<string, string>;
  const out: Registry = {};
  for (const [k, f] of Object.entries(reg)) {
    out[k] = JSON.parse(readFileSync(new URL(f, sdir), 'utf8'));
  }
  return out;
}

let failures = 0;
function check(cond: boolean, label: string): void {
  if (!cond) { console.error(`  FAIL ${label}`); failures++; }
}

async function makeManifold(dir: string, withFaces: boolean, verticesF32: boolean): Promise<Store> {
  await fs.rm(dir, { recursive: true, force: true });
  const store = create(new FileSystemStore(dir), dir);
  await attrs.write(store, '', { schema: 'nxr.manifold@1.0', nV: 4, nF: 2 });
  if (verticesF32) await write(store, 'mesh/vertices', new Float32Array(12), { shape: [4, 3], dtype: 'float32' });
  else await write(store, 'mesh/vertices', new Float64Array(12), { shape: [4, 3], dtype: 'float64' });
  if (withFaces) await write(store, 'mesh/faces', new Int32Array(6), { shape: [2, 3], dtype: 'int32' });
  return store;
}

async function main(): Promise<void> {
  const registry = loadRegistry();
  const base = os.tmpdir();

  // version-tag parsing
  const tag = readSchemaTag({ schema: 'nxr.manifold@1.0' });
  check(tag.kind === 'manifold' && tag.major === 1 && tag.minor === 0, 'readSchemaTag parses tag');

  // valid manifold
  const ok = await makeManifold(path.join(base, 'nxr_ts_ok.zarr'), true, false);
  check((await validateStore(ok, '', registry)).length === 0, 'valid manifold passes');

  // missing required array mesh/faces
  const nofaces = await makeManifold(path.join(base, 'nxr_ts_nofaces.zarr'), false, false);
  const i1 = await validateStore(nofaces, '', registry);
  check(i1.length > 0, 'missing faces flagged');
  check(i1.some((x) => x.path.includes('faces') || x.message.includes('faces')), 'issue mentions faces');

  // wrong dtype (float32 vertices)
  const wrongdt = await makeManifold(path.join(base, 'nxr_ts_wrongdt.zarr'), true, true);
  const i2 = await validateStore(wrongdt, '', registry);
  check(i2.some((x) => x.path.includes('vertices')), 'wrong dtype flagged');

  // unknown schema version
  const badDir = path.join(base, 'nxr_ts_badver.zarr');
  await fs.rm(badDir, { recursive: true, force: true });
  const bad = create(new FileSystemStore(badDir), badDir);
  await attrs.write(bad, '', { schema: 'nxr.manifold@9.9' });
  check((await validateStore(bad, '', registry)).length > 0, 'unknown version flagged');

  console.log(failures === 0 ? 'PASS schema.node' : `FAIL schema.node (${failures} check(s) failed)`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
