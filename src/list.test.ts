// vendor/nxr-io/src/list.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openLocal } from './store-node.js';
import { listChildren } from './list.js';

// ─── helpers ────────────────────────────────────────────────────────────────

async function writeZgroup(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, '.zgroup'), JSON.stringify({ zarr_format: 2 }));
}

async function writeZarray(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, '.zarray'), JSON.stringify({
    zarr_format: 2,
    shape: [100, 4],
    chunks: [100, 4],
    dtype: '<f4',
    compressor: null,
    fill_value: 0,
    order: 'C',
    filters: null,
  }));
}

// ─── v2 listing tests ────────────────────────────────────────────────────────

describe('@nxr/io listChildren — Zarr v2', () => {
  let tempRoot: string;

  beforeAll(async () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'nxr-list-v2-'));
    // Build: <tempRoot>/sensors/recordings/sess1/{data, times}
    await writeZgroup(tempRoot);
    await writeZgroup(join(tempRoot, 'sensors'));
    await writeZgroup(join(tempRoot, 'sensors', 'recordings'));
    await writeZgroup(join(tempRoot, 'sensors', 'recordings', 'sess1'));
    await writeZarray(join(tempRoot, 'sensors', 'recordings', 'sess1', 'data'));
    await writeZarray(join(tempRoot, 'sensors', 'recordings', 'sess1', 'times'));
  });

  afterAll(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('recognises a v2 group child of sensors/recordings', async () => {
    const store = await openLocal(tempRoot);
    const children = await listChildren(store, 'sensors/recordings');
    expect(children).toHaveLength(1);
    expect(children[0].name).toBe('sess1');
    expect(children[0].nodeType).toBe('group');
    expect(children[0].hasChildren).toBe(true);
    expect(children[0].path).toBe('sensors/recordings/sess1');
  });

  it('recognises v2 array children inside a group', async () => {
    const store = await openLocal(tempRoot);
    const children = await listChildren(store, 'sensors/recordings/sess1');
    expect(children).toHaveLength(2);
    const names = children.map(c => c.name).sort();
    expect(names).toEqual(['data', 'times']);
    children.forEach(c => {
      expect(c.nodeType).toBe('array');
      expect(c.hasChildren).toBe(false);
    });
  });

  it('v2 root group is expandable', async () => {
    const store = await openLocal(tempRoot);
    const children = await listChildren(store, '');
    const sensors = children.find(c => c.name === 'sensors');
    expect(sensors).toBeDefined();
    expect(sensors!.nodeType).toBe('group');
    expect(sensors!.hasChildren).toBe(true);
  });
});
