/**
 * @nxr/io — Group operations
 *
 * Create groups and check existence.
 */

import * as zarr from 'zarrita';
import type { Mutable } from '@zarrita/storage';
import type { Store } from './store.js';
import type { Attrs } from './types.js';

// ─── Existence ──────────────────────────────────────────────────────────────

/**
 * Check if a group exists at path.
 */
async function exists(store: Store, path: string): Promise<boolean> {
  try {
    const loc = store.location.resolve(path);
    await zarr.open(loc, { kind: 'group' });
    return true;
  } catch {
    return false;
  }
}

// ─── Create ─────────────────────────────────────────────────────────────────

/**
 * Create a group at path.
 *
 * @param store      - Writable store
 * @param path       - Group path
 * @param attributes - Optional initial attributes
 *
 * @example
 * ```ts
 * await group.create(store, 'manifold/eigenmodes', { K: 300 });
 * ```
 */
async function create(
  store: Store<Mutable>,
  path: string,
  attributes?: Attrs
): Promise<void> {
  const loc = store.location.resolve(path);
  if (attributes) {
    await zarr.create(loc, { attributes });
  } else {
    await zarr.create(loc, {});
  }
}

// ─── Export as namespace ────────────────────────────────────────────────────

export const group = { exists, create };
