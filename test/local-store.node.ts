import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLocal, openLocal } from '../src/store.js';
import { write } from '../src/write.js';
import { read } from '../src/read.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nxrio-local-'));
const root = path.join(dir, 'test.zarr');

const wstore = createLocal(root);
await write(wstore, 'group/values', new Float64Array([1, 2, 3, 4]), {
  shape: [4], dtype: 'float64',
});

// On-disk v3 marker exists
assert.ok(fs.existsSync(path.join(root, 'group', 'values', 'zarr.json')), 'array zarr.json written');

const rstore = await openLocal(root);
const back = await read(rstore, 'group/values', { as: 'float64' });
assert.deepEqual(Array.from(back), [1, 2, 3, 4]);

fs.rmSync(dir, { recursive: true, force: true });
console.log('local-store: OK');
