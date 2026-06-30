import { describe, it, expect, beforeAll } from 'vitest';
import { createLocal, write, group } from '@nxr/io';
import { read } from './read.js';
import { openLocal } from './store-node.js';
import { countingStore, chunkKeys } from '../../../scripts/counting-store.mjs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dir: string;
beforeAll(async () => {
  dir = join(mkdtempSync(join(tmpdir(), 'cf-read-')), 'arr.zarr');
  const store = createLocal(dir);
  await group.create(store, '');
  // a2d[c,t] = c*100 + t, shape [3,100], time-chunked [3,10] → 10 time chunks
  const a2d = new Float32Array(3 * 100);
  for (let c = 0; c < 3; c++) for (let t = 0; t < 100; t++) a2d[c * 100 + t] = c * 100 + t;
  await write(store, 'a2d', a2d, { shape: [3, 100], chunks: [3, 10], dtype: 'float32' });
  // a1d[t] = t, shape [10], chunks [4]
  const a1d = new Float64Array(10);
  for (let t = 0; t < 10; t++) a1d[t] = t;
  await write(store, 'a1d', a1d, { shape: [10], chunks: [4], dtype: 'float64' });
});

describe('read() slice', () => {
  it('slices the time axis across chunk boundaries (2D)', async () => {
    const store = await openLocal(dir);
    const data = await read<Float32Array>(store, 'a2d', { slice: [[0, 3], [2, 7]], as: 'float32' });
    expect(data.length).toBe(3 * 5);          // [3, 5]
    // row-major [3,5]: data[c*5 + (t-2)] = c*100 + t
    expect(data[0]).toBe(2);                   // c0, t2
    expect(data[4]).toBe(6);                   // c0, t6
    expect(data[5]).toBe(102);                 // c1, t2
    expect(data[14]).toBe(206);                // c2, t6
  });

  it('slices a 1D array', async () => {
    const store = await openLocal(dir);
    const data = await read<Float64Array>(store, 'a1d', { slice: [[3, 9]] });
    expect(Array.from(data)).toEqual([3, 4, 5, 6, 7, 8]);
  });

  it('fetches only the covering chunks (proof)', async () => {
    const { store, keys } = countingStore(dir);
    // time window [25,45) covers chunk-time indices 2,3,4 of 10 → 3 data chunks
    const data = await read<Float32Array>(store as any, 'a2d', { slice: [[0, 3], [25, 45]], as: 'float32' });
    expect(data.length).toBe(3 * 20);
    const fetched = chunkKeys(keys, '/a2d');
    expect(fetched.length).toBe(3);   // NOT all 10 chunks
  });
});
