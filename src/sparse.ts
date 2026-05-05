/**
 * @nxr/io — Sparse matrix I/O (COO format)
 *
 * On-disk layout (Zarr v3 group):
 *   path/
 *     zarr.json  → group node
 *     row/       → uint32[nnz]  (0-based)
 *     col/       → uint32[nnz]  (0-based)
 *     data/      → float32[nnz] or float64[nnz]
 *
 * Group attributes: { format: "coo", shape: [m, n], nnz: N }
 */

import type { Mutable } from '@zarrita/storage';
import type { Store } from './store.js';
import type { SparseCOO, Attrs } from './types.js';
import { read } from './read.js';
import { write } from './write.js';
import { attrs } from './attrs.js';
import { group } from './group.js';

// ─── Read ───────────────────────────────────────────────────────────────────

interface SparseMeta extends Attrs {
  format: 'coo';
  shape: [number, number];
  nnz: number;
}

/**
 * Read a sparse COO matrix.
 *
 * @param store - Opened store
 * @param path  - Path to the sparse group
 *
 * @example
 * ```ts
 * const mass = await sparse.read(store, 'operators/mass');
 * ```
 */
async function readCOO(store: Store, path: string): Promise<SparseCOO> {
  const meta = await attrs.read<SparseMeta>(store, path);

  if (meta.format !== 'coo') {
    throw new Error(`[nxr/io] Expected COO format at "${path}", got "${meta.format}"`);
  }

  const [row, col, data] = await Promise.all([
    read<Uint32Array>(store, `${path}/row`),
    read<Uint32Array>(store, `${path}/col`),
    read<Float32Array | Float64Array>(store, `${path}/data`),
  ]);

  return { row, col, data, shape: meta.shape, nnz: meta.nnz };
}

// ─── Write ──────────────────────────────────────────────────────────────────

/**
 * Write a sparse COO matrix.
 *
 * @param store  - Writable store
 * @param path   - Destination group path
 * @param matrix - COO data
 *
 * @example
 * ```ts
 * await sparse.write(store, 'operators/stiffness', coo);
 * ```
 */
async function writeCOO(
  store: Store<Mutable>,
  path: string,
  matrix: SparseCOO
): Promise<void> {
  const { row, col, data, shape, nnz } = matrix;

  if (row.length !== nnz || col.length !== nnz || data.length !== nnz) {
    throw new Error(
      `[nxr/io] COO length mismatch: nnz=${nnz}, row=${row.length}, col=${col.length}, data=${data.length}`
    );
  }

  // Create parent group with metadata
  await group.create(store, path, {
    format: 'coo',
    shape,
    nnz,
  });

  // Write sub-arrays in parallel
  await Promise.all([
    write(store, `${path}/row`, row, { shape: [nnz], dtype: 'uint32' }),
    write(store, `${path}/col`, col, { shape: [nnz], dtype: 'uint32' }),
    write(store, `${path}/data`, data, {
      shape: [nnz],
      dtype: data instanceof Float64Array ? 'float64' : 'float32',
    }),
  ]);
}

// ─── Utilities ──────────────────────────────────────────────────────────────

/**
 * Check if a path holds a COO sparse matrix.
 */
async function isCOO(store: Store, path: string): Promise<boolean> {
  try {
    const meta = await attrs.read<Attrs>(store, path);
    return meta.format === 'coo';
  } catch {
    return false;
  }
}

/**
 * Convert COO → dense Float32Array (row-major).
 * Only for small/moderate matrices.
 */
function toDense(matrix: SparseCOO): Float32Array {
  const [m, n] = matrix.shape;
  const out = new Float32Array(m * n);
  for (let i = 0; i < matrix.nnz; i++) {
    out[matrix.row[i] * n + matrix.col[i]] = matrix.data[i];
  }
  return out;
}

/**
 * Convert COO → CSR (compressed sparse row).
 * Better for matrix-vector products on CPU.
 */
function toCSR(matrix: SparseCOO) {
  const [m] = matrix.shape;
  const { row, col, data, nnz } = matrix;

  const count = new Uint32Array(m);
  for (let i = 0; i < nnz; i++) count[row[i]]++;

  const indptr = new Uint32Array(m + 1);
  for (let i = 0; i < m; i++) indptr[i + 1] = indptr[i] + count[i];

  const indices = new Uint32Array(nnz);
  const values = new Float32Array(nnz);
  const cursor = new Uint32Array(m);

  for (let i = 0; i < nnz; i++) {
    const r = row[i];
    const pos = indptr[r] + cursor[r];
    indices[pos] = col[i];
    values[pos] = data[i];
    cursor[r]++;
  }

  return { indptr, indices, data: values, shape: matrix.shape };
}

// ─── Export as namespace ────────────────────────────────────────────────────

export const sparse = { read: readCOO, write: writeCOO, isCOO, toDense, toCSR };
