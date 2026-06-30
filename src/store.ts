/**
 * @nxr/io — Store
 *
 * Open and manage Zarr v3 stores.
 */

import { FetchStore } from 'zarrita';
import type { Readable, Mutable } from '@zarrita/storage';
import { Location, root } from 'zarrita';
import type { OpenOptions } from './types.js';

// ─── Store Handle ───────────────────────────────────────────────────────────

/** A handle to an opened Zarr store */
export interface Store<S extends Readable = Readable> {
  location: Location<S>;
  url: string;
  mode: 'r' | 'w' | 'rw';
}

/** Read-only store (HTTP-backed) */
export type ReadStore = Store<Readable>;

/** Writable store */
export type WriteStore = Store<Mutable>;

// ─── Open ───────────────────────────────────────────────────────────────────

/**
 * Open a Zarr store at the given URL.
 *
 * @param url  - HTTP URL or path to .zarr root
 * @param opts - { mode: 'r' | 'w' | 'rw' }
 *
 * @example
 * ```ts
 * const store = await open('https://data.nxr.io/brain.zarr');
 * ```
 */
export async function open(url: string, opts?: OpenOptions): Promise<ReadStore> {
  const mode = opts?.mode ?? 'r';

  const resolved = url.startsWith('http')
    ? url
    : typeof globalThis.window !== 'undefined'
      ? new URL(url, globalThis.window.location.origin).href
      : url;

  const backend = new FetchStore(resolved);
  const location = root(backend);

  return { location, url: resolved, mode };
}

/**
 * Create a writable store from an existing Mutable backend.
 *
 * Use this with zarrita's writable backends (e.g., Map store for testing,
 * or a custom IndexedDB/OPFS store for persistence).
 *
 * @param backend  - A Mutable store instance
 * @param url      - Identifier for logging/debugging
 *
 * @example
 * ```ts
 * import { MapStore } from '@zarrita/storage';
 * const store = create(new MapStore(), 'memory://test');
 * ```
 */
export function create<S extends Mutable>(backend: S, url: string): Store<S> {
  const location = root(backend);
  return { location, url, mode: 'w' };
}
