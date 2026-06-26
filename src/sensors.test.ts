// vendor/nxr-io/src/sensors.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { openLocal } from './store.js';
import { readSensorChannels, listSensorRecordings, readSensorRecording, readSensorWindow } from './sensors.js';
import { writeSensorStore } from '../../../scripts/gen-nxr-fixtures.mjs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dir: string;
beforeAll(async () => {
  dir = join(mkdtempSync(join(tmpdir(), 'cf-io-')), 'meg.zarr');
  await writeSensorStore(dir, { nChan: 4, nTime: 500, sfreq: 250 });
});

describe('@nxr/io sensors', () => {
  it('readSensorChannels returns names/types/flags', async () => {
    const store = await openLocal(dir);
    const ch = await readSensorChannels(store);
    expect(ch.names.length).toBe(4);
    expect(ch.flags[1]).toBe(-1);
  });
  it('listSensorRecordings finds sessions', async () => {
    const store = await openLocal(dir);
    expect(await listSensorRecordings(store)).toContain('session_001');
  });

  it('readSensorRecording returns [nChan*nTime] + meta', async () => {
    const store = await openLocal(dir);
    const r = await readSensorRecording(store, 'session_001');
    expect(r.nChan).toBe(4);
    expect(r.nTime).toBe(500);
    expect(r.data.length).toBe(2000);
    expect(r.sfreq).toBe(250);
    expect(r.events.length).toBeGreaterThan(0);
  });

  it('readSensorWindow slices the time axis', async () => {
    const store = await openLocal(dir);
    const w = await readSensorWindow(store, 'session_001', 100, 200);
    expect(w.nTime).toBe(100);
    expect(w.data.length).toBe(4 * 100);
    expect(w.times[0]).toBeCloseTo(100 / 250, 10);
  });

  it('readSensorWindow returns empty for a degenerate (s0 >= s1) window', async () => {
    const store = await openLocal(dir);
    const w = await readSensorWindow(store, 'session_001', 200, 100);
    expect(w.nTime).toBe(0);
    expect(w.data.length).toBe(0);
    expect(w.times.length).toBe(0);
  });
});
