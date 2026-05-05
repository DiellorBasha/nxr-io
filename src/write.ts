/**
 * @nxr/io — Write operations
 *
 * Create arrays and groups in a writable Zarr store.
 */

import * as zarr from 'zarrita';
import type { Mutable } from '@zarrita/storage';
import type { DataType as ZarrDataType, Chunk } from 'zarrita';
import type { Store } from './store.js';
import type { TypedArray, WriteOptions, DataType } from './types.js';

// ─── Array Write ────────────────────────────────────────────────────────────

/**
 * Write a TypedArray as a Zarr v3 array.
 *
 * @param store - Writable store
 * @param path  - Destination path (e.g., 'eigenmodes/vectors')
 * @param data  - The array data
 * @param opts  - Shape (required), dtype, chunks, fill_value, attributes
 *
 * @example
 * ```ts
 * await write(store, 'eigenmodes/values', eigenvalues, {
 *   shape: [300],
 *   dtype: 'float64',
 * });
 * ```
 */
export async function write(
  store: Store<Mutable>,
  path: string,
  data: TypedArray,
  opts: WriteOptions
): Promise<void> {
  const { shape, chunks, fill_value, attributes } = opts;
  const dtype = opts.dtype ?? infer(data);
  const chunkShape = chunks ?? shape;

  const loc = store.location.resolve(path);

  const array = await zarr.create(loc, {
    shape,
    chunk_shape: chunkShape,
    data_type: dtype as ZarrDataType,
    fill_value: fill_value ?? 0,
    ...(attributes ? { attributes } : {}),
  });

  await zarr.set(array, null, {
    data,
    shape,
    stride: strides(shape),
  } as Chunk<ZarrDataType>);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Infer Zarr v3 data_type from TypedArray instance */
function infer(data: TypedArray): DataType {
  if (data instanceof Float32Array) return 'float32';
  if (data instanceof Float64Array) return 'float64';
  if (data instanceof Int32Array)   return 'int32';
  if (data instanceof Int16Array)   return 'int16';
  if (data instanceof Int8Array)    return 'int8';
  if (data instanceof Uint32Array)  return 'uint32';
  if (data instanceof Uint16Array)  return 'uint16';
  if (data instanceof Uint8Array)   return 'uint8';
  return 'float64';
}

/** Row-major (C-order) strides */
function strides(shape: number[]): number[] {
  const n = shape.length;
  const s = new Array(n);
  s[n - 1] = 1;
  for (let i = n - 2; i >= 0; i--) {
    s[i] = s[i + 1] * shape[i + 1];
  }
  return s;
}
