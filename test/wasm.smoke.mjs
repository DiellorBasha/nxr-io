// WASM smoke test: stage a C++-generated store into MEMFS, read it back through
// the WASM ZarrStore (proves the wasm build decodes zstd + chunks + CSC).
// Requires: scripts/build-wasm.sh (bindings/wasm/dist) and cpp/build/nxr_io_gen.
// Run: npm run test:wasm
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, readFileSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const gen = path.join(here, '..', 'cpp', 'build', 'nxr_io_gen');
const wasmJs = path.join(here, '..', 'bindings', 'wasm', 'dist', 'nxr_io.js');

if (!existsSync(wasmJs)) { console.error('SKIP wasm: run scripts/build-wasm.sh first'); process.exit(1); }
if (!existsSync(gen)) { console.error('SKIP wasm: build cpp/build/nxr_io_gen first'); process.exit(1); }

const { default: createNxrIoModule } = await import(wasmJs);

function stageDir(Module, hostDir, wasmDir) {
  Module.FS.mkdirTree(wasmDir);
  for (const name of readdirSync(hostDir)) {
    const hp = path.join(hostDir, name);
    const wp = `${wasmDir}/${name}`;
    if (statSync(hp).isDirectory()) stageDir(Module, hp, wp);
    else Module.FS.writeFile(wp, readFileSync(hp));
  }
}

let failures = 0;
const check = (cond, label) => { if (!cond) { console.error(`  FAIL ${label}`); failures++; } };

// Produce a known store with the native engine, then stage it into MEMFS.
const host = path.join(os.tmpdir(), 'nxr_wasm_fixture.zarr');
rmSync(host, { recursive: true, force: true });
execFileSync(gen, [host], { stdio: 'inherit' });

const Module = await createNxrIoModule();
stageDir(Module, host, '/store');

const store = new Module.ZarrStore('/store');
try {
  check(store.isArray('leadfield'), 'isArray leadfield');
  const meta = JSON.parse(store.readMetadata('leadfield'));
  check(JSON.stringify(meta.shape) === '[3,5]', 'leadfield shape [3,5]');

  const lf = store.readArray('leadfield');
  check(lf.dtype === 'float64' && lf.data.length === 15, 'leadfield dtype/len');
  check(Array.from(lf.data).every((v, i) => v === i), 'leadfield values (wasm zstd + edge chunks)');

  const vn = store.readArray('vertno');
  check(Array.from(vn.data).join(',') === '10,20,30,40', 'vertno int32');

  check(JSON.parse(store.readAttributes('operators/stiffness')).format === 'csc', 'sparse format csc');
  const indptr = store.readArray('operators/stiffness/indptr');
  check(Array.from(indptr.data).join(',') === '0,2,3,4', 'csc indptr');
} finally {
  store.delete();
}

console.log(failures === 0 ? 'PASS wasm.smoke' : `FAIL wasm.smoke (${failures} check(s) failed)`);
process.exit(failures ? 1 : 0);
