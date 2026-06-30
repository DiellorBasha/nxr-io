import { describe, it, expect, beforeAll } from 'vitest';
import { openLocal } from './store-node.js';
import { readSensorWindow, readSensorRecording } from './sensors.js';
import { writeSensorStore } from '../../../scripts/gen-nxr-fixtures.mjs';
import { countingStore, chunkKeys } from '../../../scripts/counting-store.mjs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dir: string;
beforeAll(async () => {
  // nChan=4, nTime=500, chunks [4,128] → 4 time chunks (0-127,128-255,256-383,384-499)
  dir = join(mkdtempSync(join(tmpdir(), 'cf-win-')), 'meg.zarr');
  await writeSensorStore(dir, { nChan: 4, nTime: 500, sfreq: 250 });
});

describe('readSensorWindow chunk-aligned read', () => {
  it('matches the full recording band', async () => {
    const store = await openLocal(dir);
    const full = await readSensorRecording(store, 'session_001');     // [4,500] row-major
    const w = await readSensorWindow(store, 'session_001', 150, 200);
    expect(w.nChan).toBe(4);
    expect(w.nTime).toBe(50);
    expect(w.data.length).toBe(4 * 50);
    for (let c = 0; c < 4; c++) {
      for (let t = 0; t < 50; t++) {
        expect(w.data[c * 50 + t]).toBeCloseTo(full.data[c * 500 + (150 + t)], 6);
      }
    }
  });

  it('fetches only the covering data chunks (proof)', async () => {
    const { store, keys } = countingStore(dir);
    // window [150,200) lies entirely inside time-chunk 1 (128-255) → 1 data chunk
    const w = await readSensorWindow(store as any, 'session_001', 150, 200);
    expect(w.nTime).toBe(50);
    const fetched = chunkKeys(keys, '/sensors/recordings/session_001/data');
    // NOTE: fixtures are Zarr v3 (keys .../c/0/1); production sensor stores are v2 (.../0.1). Chunk selection is zarrita-abstracted across both, but this proof runs on v3.
    expect(fetched.length).toBe(1);   // NOT all 4 chunks
  });
});
