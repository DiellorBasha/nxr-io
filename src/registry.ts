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
  const map = JSON.parse(
    readFileSync(new URL('registry.json', sdir), 'utf8'),
  ).registry as Record<string, string>;
  const out: Registry = {};
  for (const [kind, file] of Object.entries(map)) {
    out[kind] = JSON.parse(readFileSync(new URL(file, sdir), 'utf8')) as Registry[string];
  }
  return out;
}
