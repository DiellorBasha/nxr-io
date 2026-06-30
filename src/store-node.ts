/** Node-only store openers (filesystem-backed). Kept out of store.ts so the
 *  open/read/attrs surface stays free of node:fs for the renderer bundle. */
import { FileSystemStore } from '@zarrita/storage';
import { Location, root } from 'zarrita';
import type { OpenOptions } from './types.js';
import type { Store } from './store.js';

/** Open a Zarr store on the local filesystem (Node only). Read + write. */
export async function openLocal(path: string, _opts?: OpenOptions): Promise<Store<FileSystemStore>> {
  const backend = new FileSystemStore(path);
  return { location: root(backend) as Location<FileSystemStore>, url: path, mode: 'rw' };
}

/** Create a writable filesystem store (Node only). */
export function createLocal(path: string): Store<FileSystemStore> {
  const backend = new FileSystemStore(path);
  return { location: root(backend) as Location<FileSystemStore>, url: path, mode: 'w' };
}
