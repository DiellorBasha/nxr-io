/**
 * @nxr/io — Attribute operations
 *
 * Read and write JSON attributes on groups and arrays.
 */

import * as zarr from 'zarrita';
import type { Mutable } from '@zarrita/storage';
import type { Store } from './store.js';
import type { Attrs } from './types.js';

// ─── Read ───────────────────────────────────────────────────────────────────

/**
 * Read attributes from a group.
 *
 * @param store - Opened store
 * @param path  - Group path ('' for root)
 *
 * @example
 * ```ts
 * const meta = await attrs.read(store, 'manifold');
 * ```
 */
async function read<T extends Attrs = Attrs>(store: Store, path: string): Promise<T> {
  const loc = path ? store.location.resolve(path) : store.location;
  const group = await zarr.open(loc, { kind: 'group' });
  return (group.attrs ?? {}) as T;
}

/**
 * Read attributes from an array node.
 */
async function readArray<T extends Attrs = Attrs>(store: Store, path: string): Promise<T> {
  const loc = store.location.resolve(path);
  try {
    const array = await zarr.open(loc, { kind: 'array' });
    return ((array as any).attrs ?? {}) as T;
  } catch {
    return {} as T;
  }
}

// ─── Write ──────────────────────────────────────────────────────────────────

/**
 * Write attributes to a group. Creates the group if it doesn't exist.
 * When the group exists, merges `data` into the existing attributes and
 * persists the updated zarr.json back to the store.
 *
 * @param store - Writable store
 * @param path  - Group path
 * @param data  - JSON-serializable attributes
 */
async function write(store: Store<Mutable>, path: string, data: Attrs): Promise<void> {
  const loc = path ? store.location.resolve(path) : store.location;
  const zarrJsonPath = loc.resolve('zarr.json').path;

  try {
    // Try reading the existing zarr.json metadata
    const existingBytes = await (store.location.store as Mutable).get(zarrJsonPath);
    if (!existingBytes) throw new Error('no zarr.json');
    const meta = JSON.parse(new TextDecoder().decode(existingBytes)) as Record<string, unknown>;
    // Merge attributes into the existing metadata document
    const merged = Object.assign({}, (meta.attributes as Record<string, unknown>) ?? {}, data);
    meta.attributes = merged;
    await (store.location.store as Mutable).set(
      zarrJsonPath,
      new TextEncoder().encode(JSON.stringify(meta, null, 2)),
    );
  } catch {
    // Group doesn't exist yet — create it with the given attributes
    await zarr.create(loc, { attributes: data });
  }
}

// ─── Export as namespace ────────────────────────────────────────────────────

export const attrs = { read, readArray, write };
