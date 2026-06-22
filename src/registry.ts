/**
 * @nxr/io — registry loader.
 *
 * Reads schema/registry.json + each referenced kind file into a Registry.
 * The JSON schema files are the single source of truth; this is the only
 * sanctioned way to obtain the Registry that validateStore / accessors use.
 */
import { readFileSync } from 'node:fs';
import type { Registry } from './schema.js';

/** Load the canonical nxr kind registry from the bundled schema/ directory. */
export function loadRegistry(): Registry {
  const sdir = new URL('../schema/', import.meta.url);
  const map = (
    JSON.parse(readFileSync(new URL('registry.json', sdir), 'utf8')) as { registry?: Record<string, string> }
  ).registry;
  if (!map) throw new Error('[nxr/io] registry.json is missing the "registry" key');
  const out: Registry = {};
  for (const [kind, file] of Object.entries(map)) {
    try {
      out[kind] = JSON.parse(readFileSync(new URL(file, sdir), 'utf8')) as Registry[string];
    } catch (err) {
      throw new Error(`[nxr/io] failed to load kind "${kind}" from "${file}": ${(err as Error).message}`);
    }
  }
  return out;
}
