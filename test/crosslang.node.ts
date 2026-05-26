/**
 * Cross-language test: the C++ engine writes a store (zstd + edge chunks + CSC
 * sparse), then zarrita / @nxr/io reads it back and the values must match.
 * Proves C++ writes spec-correct Zarr v3 and the TS reader consumes it.
 *
 * Requires the C++ build (cpp/build/nxr_io_gen). Run: npm run test:crosslang
 */
import { execFileSync } from 'node:child_process';
import { promises as fs, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import FileSystemStore from '@zarrita/storage/fs';
import { root } from 'zarrita';
import { read, meta, sparse } from '../src/index.js';
import type { Store } from '../src/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const gen = path.join(here, '..', 'cpp', 'build', 'nxr_io_gen');

function openFS(p: string): Store {
  return { location: root(new FileSystemStore(p)), url: p, mode: 'r' };
}

let failures = 0;
const check = (cond: boolean, label: string): void => {
  if (!cond) { console.error(`  FAIL ${label}`); failures++; }
};

async function main(): Promise<void> {
  if (!existsSync(gen)) {
    console.error(`SKIP crosslang: build the C++ engine first (cpp/build/nxr_io_gen missing)`);
    process.exit(1);
  }
  const dir = path.join(os.tmpdir(), 'nxr_crosslang.zarr');
  await fs.rm(dir, { recursive: true, force: true });
  execFileSync(gen, [dir], { stdio: 'inherit' });

  const store = openFS(dir);

  // Dense float64, zstd + edge chunks [2,3] over [3,5] — decoded by zarrita (numcodecs zstd).
  const lf = await read<Float64Array>(store, 'leadfield');
  check(lf.length === 15, 'leadfield length 15');
  check(Array.from(lf).every((v, i) => v === i), 'leadfield values 0..14 (zstd + edge chunks)');
  const m = await meta(store, 'leadfield');
  check(JSON.stringify(m.shape) === '[3,5]', 'leadfield shape [3,5]');

  // int32.
  const vn = await read<Int32Array>(store, 'vertno');
  check(Array.from(vn).join(',') === '10,20,30,40', 'vertno int32 values');

  // CSC sparse — read via the aligned TS sparse reader.
  const s = await sparse.read(store, 'operators/stiffness');
  check(Array.from(s.indptr).join(',') === '0,2,3,4', 'csc indptr');
  check(Array.from(s.indices).join(',') === '0,2,1,2', 'csc indices');
  check(Array.from(s.data).join(',') === '10,5,20,30', 'csc data');
  check(s.shape[0] === 3 && s.shape[1] === 3 && s.nnz === 4, 'csc shape/nnz');

  console.log(failures === 0 ? 'PASS crosslang.node' : `FAIL crosslang.node (${failures} check(s) failed)`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
