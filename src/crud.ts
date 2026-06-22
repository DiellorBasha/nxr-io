/**
 * @nxr/io — structural CRUD primitives.
 *
 * Generic node delete/move over the store's filesystem path (Node/local-store
 * scoped, like list.ts). No schema awareness — callers compose these with any
 * schema-specific fixups (e.g. updating a parent group's name index).
 */
import { rm, rename, mkdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Store } from './store.js'

/** Recursively delete the node at `path`. Throws on empty path or missing node. */
export async function remove(store: Store, path: string): Promise<void> {
  if (!path) throw new Error('[nxr/io] remove: refusing to delete the store root (empty path)')
  const target = join(store.url, path)
  try { await stat(target) } catch { throw new Error(`[nxr/io] remove: no node at "${path}"`) }
  await rm(target, { recursive: true, force: true })
}

/** Move the node dir `fromPath` → `toPath`. Throws on missing source or existing target. */
export async function move(store: Store, fromPath: string, toPath: string): Promise<void> {
  if (!fromPath || !toPath) throw new Error('[nxr/io] move: fromPath and toPath are required')
  const from = join(store.url, fromPath)
  const to = join(store.url, toPath)
  try { await stat(from) } catch { throw new Error(`[nxr/io] move: no node at "${fromPath}"`) }
  let toExists = true
  try { await stat(to) } catch { toExists = false }
  if (toExists) throw new Error(`[nxr/io] move: target "${toPath}" already exists`)
  await mkdir(dirname(to), { recursive: true })
  await rename(from, to)
}
