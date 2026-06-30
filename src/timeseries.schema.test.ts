import { describe, it, expect } from 'vitest';
import { loadRegistry } from './registry.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const schemaDir = fileURLToPath(new URL('../schema/', import.meta.url));

describe('nxr.timeseries@1.0 schema', () => {
  it('is registered in registry.json', () => {
    const reg = JSON.parse(readFileSync(`${schemaDir}registry.json`, 'utf8'));
    expect(reg.registry['nxr.timeseries@1.0']).toBe('nxr.timeseries.schema.json');
  });

  it('loadRegistry() includes the new kind without throwing', () => {
    const reg = loadRegistry();
    expect(JSON.stringify(reg)).toContain('nxr.timeseries');
  });

  it('the schema file declares the time-axis contract', () => {
    const s = JSON.parse(readFileSync(`${schemaDir}nxr.timeseries.schema.json`, 'utf8'));
    expect(s.kind).toBe('nxr.timeseries');
    expect(s.version).toBe('1.0');
    for (const k of ['schema', 'kind', 'axes', 'sfreq', 'n_samples', 'origin_sec']) {
      expect(s.attributes[k].required).toBe(true);
    }
    expect(s.attributes.metadata_ref.required).toBeUndefined();
    expect(s.arrays.data.required).toBe(true);
    expect(s.arrays.data.chunks).toBeTruthy();
  });
});
