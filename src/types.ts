/**
 * @nxr/io — Type definitions
 *
 * Core types for Zarr v3 array operations.
 */

// ─── Typed Arrays ───────────────────────────────────────────────────────────

export type TypedArray =
  | Float32Array
  | Float64Array
  | Int8Array
  | Int16Array
  | Int32Array
  | Uint8Array
  | Uint16Array
  | Uint32Array;

// ─── Data Types (Zarr v3 convention) ────────────────────────────────────────

export type DataType =
  | 'float32' | 'float64'
  | 'int8' | 'int16' | 'int32'
  | 'uint8' | 'uint16' | 'uint32'
  | 'bool';

// ─── Options ────────────────────────────────────────────────────────────────

/** Options for opening a store */
export interface OpenOptions {
  mode?: 'r' | 'w' | 'rw';
}

/** Options for reading arrays */
export interface ReadOptions {
  /** Cast output to this type (e.g., 'float32' for GPU upload) */
  as?: 'float32' | 'float64' | 'uint32' | 'int32';
  /** Slice specification: [start, stop] per dimension */
  slice?: [number, number][];
}

/** Options for writing arrays */
export interface WriteOptions {
  shape: number[];
  dtype?: DataType;
  chunks?: number[];
  fill_value?: number | null;
  attributes?: Attrs;
}

// ─── Metadata ───────────────────────────────────────────────────────────────

/** Array metadata (from zarr.json or .zarray) */
export interface ArrayMeta {
  shape: number[];
  dtype: string;
  chunks: number[];
  fill_value: number | null;
  order: 'C' | 'F';
}

// ─── Sparse ─────────────────────────────────────────────────────────────────

/** Sparse matrix in CSC format (matches Eigen/geometry-central + scipy csc_matrix). */
export interface SparseCSC {
  /** Column pointers, length cols+1. */
  indptr: Int32Array;
  /** Row indices, length nnz. */
  indices: Int32Array;
  /** Values, length nnz. */
  data: Float32Array | Float64Array;
  shape: [number, number];
  nnz: number;
}

// ─── Attributes ─────────────────────────────────────────────────────────────

export type Attrs = Record<string, unknown>;
