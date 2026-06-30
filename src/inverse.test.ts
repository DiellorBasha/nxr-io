// vendor/nxr-io/src/inverse.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { openLocal } from './store-node.js';
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
  it('whitener and noiseCov are null when absent (back-compat)', async () => {
    const store = await openLocal(dir);
    const inv = await readInverse(store);
    expect(inv.whitener).toBeNull();
    expect(inv.noiseCov).toBeNull();
  });
});

describe('@nxr/io readInverse — with whitener + noise_cov', () => {
  const M = 5;
  let dirW: string;
  beforeAll(async () => {
    dirW = join(mkdtempSync(join(tmpdir(), 'cf-io-inv-w-')), 'inv_w.zarr');
    await writeInverseStore(dirW, { variant: 'fixed', nV: 4, M, withWhitener: true });
  });

  it('returns whitener as Float64Array of length M*M when present', async () => {
    const store = await openLocal(dirW);
    const inv = await readInverse(store);
    expect(inv.whitener).toBeInstanceOf(Float64Array);
    expect(inv.whitener!.length).toBe(M * M);
  });

  it('returns noiseCov as Float64Array of length M*M when present', async () => {
    const store = await openLocal(dirW);
    const inv = await readInverse(store);
    expect(inv.noiseCov).toBeInstanceOf(Float64Array);
    expect(inv.noiseCov!.length).toBe(M * M);
  });

  it('existing fields still read correctly alongside whitener', async () => {
    const store = await openLocal(dirW);
    const inv = await readInverse(store);
    expect(inv.M).toBe(M);
    expect(inv.nsrc).toBe(4); // fixed ⇒ nV
    expect(inv.sourceOri).toBe('fixed');
    expect(inv.W.length).toBe(4 * M);
  });
});
