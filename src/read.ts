/**
 * @nxr/io — Read operations
 *
 * Read arrays, metadata, and attributes from a Zarr store.
 */

import * as zarr from 'zarrita';
import type { Readable } from '@zarrita/storage';
import type { DataType as ZarrDataType } from 'zarrita';
import type { Store } from './store.js';
import type { TypedArray, ArrayMeta, ReadOptions, Attrs } from './types.js';

// ─── Array Data ─────────────────────────────────────────────────────────────

/**
 * Read an array from the store.
 *
 * @param store - Opened store
 * @param path  - Path within the hierarchy (e.g., 'eigenmodes/values')
 * @param opts  - Optional: cast to type, or slice
 *
 * @example
 * ```ts
 * const verts = await read(store, 'manifold/vertices', { as: 'float32' });
 * ```
 */
export async function read<T extends TypedArray = Float64Array>(
  store: Store,
  path: string,
  opts?: ReadOptions
): Promise<T> {
  const loc = store.location.resolve(path);
  const array = await zarr.open(loc, { kind: 'array' });

  // Chunk-aligned slice: one [start, stop] per dimension. zarrita fetches only
  // the chunks intersecting the selection.
  const chunk = opts?.slice
    ? await zarr.get(array, opts.slice.map(([lo, hi]) => zarr.slice(lo, hi)))
    : await zarr.get(array);

  let data = (chunk as any).data as TypedArray;
  if (!data) {
    throw new Error(`[nxr/io] Empty array at "${path}"`);
  }

  if (opts?.as) {
    data = cast(data, opts.as);
  }

  return data as T;
}

// ─── Metadata ───────────────────────────────────────────────────────────────

/**
 * Read array metadata without fetching chunks.
 *
 * @param store - Opened store
 * @param path  - Path to array
 */
export async function meta(store: Store, path: string): Promise<ArrayMeta> {
  const loc = store.location.resolve(path);
  const array = await zarr.open(loc, { kind: 'array' });

  return {
    shape: array.shape as number[],
    dtype: array.dtype as string,
    chunks: (array as any).chunks ?? array.shape,
    fill_value: (array as any).fill_value ?? null,
    order: (array as any).order ?? 'C',
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function cast(src: TypedArray, target: 'float32' | 'float64' | 'uint32' | 'int32'): TypedArray {
  switch (target) {
    case 'float32': return new Float32Array(src);
    case 'float64': return new Float64Array(src);
    case 'uint32':  return new Uint32Array(src);
    case 'int32':   return new Int32Array(src);
  }
}
