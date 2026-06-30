/** Renderer/browser-safe surface of @nxr/io — read-only Zarr over a FetchStore.
 *  Imports nothing that reaches node:fs (verified: store.ts/read.ts/attrs.ts
 *  use only zarrita + type-only @zarrita/storage). */
export { open, create } from './store.js';
export type { Store, ReadStore, WriteStore } from './store.js';
export { read, meta } from './read.js';
export { attrs } from './attrs.js';
export type {
  TypedArray, DataType, OpenOptions, ReadOptions, ArrayMeta, Attrs,
} from './types.js';
