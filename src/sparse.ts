/**
 * @nxr/io — Sparse matrix I/O (CSC format)
 *
 * On-disk layout (Zarr v3 group):
 *   path/
 *     zarr.json  → group node, attrs { format:"csc", shape:[rows,cols], nnz:N }
 *     indptr/    → int32[cols+1]  (column pointers)
 *     indices/   → int32[nnz]     (row indices)
 *     data/      → float32[nnz] or float64[nnz]
 *
 * CSC matches Eigen / geometry-central internal storage and scipy's csc_matrix,
 * so the C++ engine reads/writes it with zero structural conversion.
 */

import type { Mutable } from '@zarrita/storage';
import type { Store } from './store.js';
import type { SparseCSC, Attrs } from './types.js';
import { read } from './read.js';
import { write } from './write.js';
import { attrs } from './attrs.js';
import { group } from './group.js';

interface SparseMeta extends Attrs {
  format: 'csc';
  shape: [number, number];
  nnz: number;
}

// ─── Read ───────────────────────────────────────────────────────────────────

/**
 * Read a sparse CSC matrix.
 *
 * @example
 * ```ts
 * const mass = await sparse.read(store, 'manifold/operators/mass');
 * ```
 */
async function readCSC(store: Store, path: string): Promise<SparseCSC> {
  const meta = await attrs.read<SparseMeta>(store, path);
  if (meta.format !== 'csc') {
    throw new Error(`[nxr/io] Expected CSC format at "${path}", got "${meta.format}"`);
  }
  const [indptr, indices, data] = await Promise.all([
    read<Int32Array>(store, `${path}/indptr`),
    read<Int32Array>(store, `${path}/indices`),
    read<Float32Array | Float64Array>(store, `${path}/data`),
  ]);
  return { indptr, indices, data, shape: meta.shape, nnz: meta.nnz };
}

// ─── Write ──────────────────────────────────────────────────────────────────

/**
 * Write a sparse CSC matrix.
 *
 * @example
 * ```ts
 * await sparse.write(store, 'operators/stiffness', csc);
 * ```
 */
async function writeCSC(store: Store<Mutable>, path: string, matrix: SparseCSC): Promise<void> {
  const { indptr, indices, data, shape, nnz } = matrix;
  const [, cols] = shape;
  if (indptr.length !== cols + 1) {
    throw new Error(`[nxr/io] CSC indptr length must be cols+1 (${cols + 1}), got ${indptr.length}`);
  }
  if (indices.length !== nnz || data.length !== nnz) {
    throw new Error(
      `[nxr/io] CSC length mismatch: nnz=${nnz}, indices=${indices.length}, data=${data.length}`,
    );
  }

  await group.create(store, path, { format: 'csc', shape, nnz });

  await Promise.all([
    write(store, `${path}/indptr`, indptr, { shape: [indptr.length], dtype: 'int32' }),
    write(store, `${path}/indices`, indices, { shape: [nnz], dtype: 'int32' }),
    write(store, `${path}/data`, data, {
      shape: [nnz],
      dtype: data instanceof Float64Array ? 'float64' : 'float32',
    }),
  ]);
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Check if a path holds a CSC sparse matrix. */
async function isCSC(store: Store, path: string): Promise<boolean> {
  try {
    const meta = await attrs.read<Attrs>(store, path);
    return meta.format === 'csc';
  } catch {
    return false;
  }
}

/** Convert CSC → dense Float32Array (row-major). Only for small/moderate matrices. */
function toDense(matrix: SparseCSC): Float32Array {
  const [m, n] = matrix.shape;
  const out = new Float32Array(m * n);
  const { indptr, indices, data } = matrix;
  for (let c = 0; c < n; c++) {
    for (let k = indptr[c]; k < indptr[c + 1]; k++) {
      out[indices[k] * n + c] = data[k];
    }
  }
  return out;
}

/** Convert CSC → CSR (better for GPU sparse matrix-vector products). */
function toCSR(matrix: SparseCSC) {
  const [m, n] = matrix.shape;
  const { indptr, indices, data, nnz } = matrix;

  const rowCount = new Uint32Array(m);
  for (let k = 0; k < nnz; k++) rowCount[indices[k]]++;

  const rowPtr = new Uint32Array(m + 1);
  for (let i = 0; i < m; i++) rowPtr[i + 1] = rowPtr[i] + rowCount[i];

  const colIdx = new Uint32Array(nnz);
  const values = new Float32Array(nnz);
  const cursor = rowPtr.slice(0, m);
  for (let c = 0; c < n; c++) {
    for (let k = indptr[c]; k < indptr[c + 1]; k++) {
      const r = indices[k];
      const pos = cursor[r]++;
      colIdx[pos] = c;
      values[pos] = data[k];
    }
  }
  return { indptr: rowPtr, indices: colIdx, data: values, shape: matrix.shape };
}

// ─── Export as namespace ────────────────────────────────────────────────────

export const sparse = { read: readCSC, write: writeCSC, isCSC, toDense, toCSR };
