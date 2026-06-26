/**
 * @nxr/io
 *
 * Zarr v3 read/write for NXR packages.
 *
 * @example
 * ```ts
 * import { open, read, meta, attrs, group, sparse } from '@nxr/io';
 *
 * const store = await open('https://data.nxr.io/brain.zarr');
 * const verts = await read(store, 'manifold/vertices', { as: 'float32' });
 * const info  = await meta(store, 'manifold/vertices');
 * const a     = await attrs.read(store, 'manifold');
 * const mass  = await sparse.read(store, 'operators/mass');
 * ```
 */

// Types
export type {
  TypedArray,
  DataType,
  OpenOptions,
  ReadOptions,
  WriteOptions,
  ArrayMeta,
  SparseCSC,
  Attrs,
} from './types.js';

// Store
export type { Store, ReadStore, WriteStore } from './store.js';
export { open, create, openLocal, createLocal } from './store.js';

// Read
export { read, meta } from './read.js';

// Write
export { write } from './write.js';

// Attributes
export { attrs } from './attrs.js';

// Groups
export { group } from './group.js';

// Sparse
export { sparse } from './sparse.js';

// Schema validation
export { validateStore, readSchemaTag } from './schema.js';
export type { SchemaIssue, KindSchema, Registry } from './schema.js';

// Registry loader
export { loadRegistry } from './registry.js';

// Typed accessors
export {
  readManifold, readEigenmodes, readDiagonalOperator, listFields, readField,
} from './accessors.js';
export type { ManifoldData, EigenData, FieldDescriptor, FieldData } from './accessors.js';

// Structural listing
export { listChildren } from './list.js';
export type { NodeEntry } from './list.js';

// Structural CRUD
export { remove, move } from './crud.js';

// Sensor accessors
export { readSensorChannels, listSensorRecordings, readSensorRecording, readSensorWindow, readSensorMeta } from './sensors.js';
export type { SensorChannelData, SensorRecordingData, SensorMeta } from './sensors.js';

// Inverse operator accessors
export { readInverse, listInverse } from './inverse.js';
export type { InverseData } from './inverse.js';

// Import surface
export { importObj } from './import/obj.js';
export type { ImportObjOptions, ImportObjResult } from './import/obj.js';
