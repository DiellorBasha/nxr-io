// vendor/nxr-io/src/sensors.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { openLocal } from './store.js';
import { readSensorChannels, listSensorRecordings } from './sensors.js';
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
});
