// vendor/nxr-io/src/inverse.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { openLocal } from './store.js';
import { readInverse, listInverse } from './inverse.js';
import { writeInverseStore } from '../../../scripts/gen-nxr-fixtures.mjs';
import { mkdtempSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path';

let dir: string;
beforeAll(async () => { dir = join(mkdtempSync(join(tmpdir(), 'cf-io-inv-')), 'inv.zarr'); await writeInverseStore(dir, { variant: 'free', nV: 4, M: 3 }); });

describe('@nxr/io readInverse', () => {
  it('reads W + source_nn + attrs (free ⇒ nsrc=3V)', async () => {
    const store = await openLocal(dir);
    const inv = await readInverse(store);
    expect(inv.M).toBe(3);
    expect(inv.nsrc).toBe(12);
    expect(inv.sourceOri).toBe('free');
    expect(inv.chNames.length).toBe(3);
    expect(inv.W.length).toBe(12 * 3);
  });
  it('listInverse returns ["default"] when present', async () => {
    expect(await listInverse(await openLocal(dir))).toEqual(['default']);
  });
});
