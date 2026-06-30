// vendor/nxr-io/src/manifold-anatomy.test.ts
// TDD: readManifold returns world_transform + units when present; null/null when absent.
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocal, openLocal } from './store-node.js';
import { group } from './group.js';
import { write } from './write.js';
import { readManifold } from './accessors.js';

// ─── Tiny mesh fixture ───────────────────────────────────────────────────────
const nV = 3;
const nF = 1;
const vertices = new Float64Array([0, 0, 0,  1, 0, 0,  0, 1, 0]);
const faces    = new Int32Array([0, 1, 2]);

// A flat 4×4 identity matrix (row-major)
const IDENTITY_16 = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];

// ─── Fixture paths ────────────────────────────────────────────────────────────
let dirWith:    string;   // store WITH world_transform + units
let dirWithout: string;   // store WITHOUT those attrs

beforeAll(async () => {
  // ── Store WITH transform + units ──────────────────────────────────────────
  dirWith = join(mkdtempSync(join(tmpdir(), 'cf-io-man-with-')), 'with.zarr');
  {
    const store = createLocal(dirWith);
    await group.create(store, '');
    // manifold group with world_transform + units attrs
    await group.create(store, 'manifold', {
      world_transform: IDENTITY_16,
      units: 'm',
    });
    await group.create(store, 'manifold/mesh');
    await write(store, 'manifold/mesh/vertices', vertices, { shape: [nV, 3], dtype: 'float64' });
    await write(store, 'manifold/mesh/faces',    faces,    { shape: [nF, 3], dtype: 'int32' });
  }

  // ── Store WITHOUT those attrs ─────────────────────────────────────────────
  dirWithout = join(mkdtempSync(join(tmpdir(), 'cf-io-man-wo-')), 'without.zarr');
  {
    const store = createLocal(dirWithout);
    await group.create(store, '');
    await group.create(store, 'manifold');   // no extra attrs
    await group.create(store, 'manifold/mesh');
    await write(store, 'manifold/mesh/vertices', vertices, { shape: [nV, 3], dtype: 'float64' });
    await write(store, 'manifold/mesh/faces',    faces,    { shape: [nF, 3], dtype: 'int32' });
  }
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('@nxr/io readManifold — anatomy (transform + units)', () => {
  it('returns world_transform (Float64Array len 16) and units when present', async () => {
    const store = await openLocal(dirWith);
    const m = await readManifold(store);

    // core geometry still intact
    expect(m.nV).toBe(nV);
    expect(m.nF).toBe(nF);

    // transform
    expect(m.transform).not.toBeNull();
    expect(m.transform!.length).toBe(16);
    expect(m.transform![0]).toBe(1);   // identity[0,0]
    expect(m.transform![5]).toBe(1);   // identity[1,1]
    expect(m.transform![10]).toBe(1);  // identity[2,2]
    expect(m.transform![15]).toBe(1);  // identity[3,3]
    expect(m.transform![1]).toBe(0);   // off-diagonal

    // units
    expect(m.units).toBe('m');
  });

  it('returns transform === null and units === null when attrs are absent (non-regression)', async () => {
    const store = await openLocal(dirWithout);
    const m = await readManifold(store);

    expect(m.nV).toBe(nV);
    expect(m.nF).toBe(nF);
    expect(m.transform).toBeNull();
    expect(m.units).toBeNull();
  });
});
