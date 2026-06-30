import { describe, it, expect, beforeAll } from 'vitest';
import { openLocal } from './store.js';
import { readTimeseriesMeta, readTimeseriesWindow, listTimeseries } from './timeseries.js';
import { writeTimeseriesStore } from '../../../scripts/gen-nxr-fixtures.mjs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dir: string;
beforeAll(async () => {
  dir = join(mkdtempSync(join(tmpdir(), 'cf-ts-')), 'ts.zarr');
  await writeTimeseriesStore(dir, { name: 'rec', nChan: 4, nTime: 500, sfreq: 250 });
});

describe('@nxr/io timeseries', () => {
  it('listTimeseries finds the timeseries', async () => {
    const store = await openLocal(dir);
    expect(await listTimeseries(store)).toContain('rec');
  });

  it('readTimeseriesMeta derives the time vector from attrs', async () => {
    const store = await openLocal(dir);
    const m = await readTimeseriesMeta(store, 'rec');
    expect(m.sfreq).toBe(250);
    expect(m.nSamples).toBe(500);
    expect(m.originSec).toBe(0);
    expect(m.kind).toBe('sensor');
    expect(m.axes).toEqual(['channel', 'time']);
    expect(m.dims).toEqual([4]);                 // non-time dims
    expect(m.metadataRef).toBe('sensors');
  });

  it('readTimeseriesWindow slices the time axis', async () => {
    const store = await openLocal(dir);
    const w = await readTimeseriesWindow(store, 'rec', 100, 200);
    expect(w.nTime).toBe(100);
    expect(w.dims).toEqual([4]);
    expect(w.data.length).toBe(4 * 100);
    // row-major [4,100]: data[c*100 + (t-100)] = c*1000 + t
    expect(w.data[0]).toBe(100);                 // c0, t100
    expect(w.data[100]).toBe(1100);              // c1, t100
  });

  it('readTimeseriesWindow returns empty for a degenerate window', async () => {
    const store = await openLocal(dir);
    const w = await readTimeseriesWindow(store, 'rec', 200, 100);
    expect(w.nTime).toBe(0);
    expect(w.data.length).toBe(0);
  });
});
