/**
 * @nxr/io — structural listing.
 *
 * listChildren walks a Zarr v3 store's group structure by reading directory
 * entries (node:fs) and each child's zarr.json node_type. Names + type +
 * expandable hint only — no shapes/dtypes/values. Node/local-store scoped
 * (uses the store's filesystem path; not for HTTP FetchStore).
 */
import { readdir, readFile } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { join } from 'node:path'
import type { Store } from './store.js'

export interface NodeEntry {
  name: string
  path: string
  nodeType: 'group' | 'array'
  hasChildren: boolean
}

/** node_type from a child dir's zarr.json, or null if it isn't a Zarr node. */
async function nodeTypeAt(dir: string): Promise<'group' | 'array' | null> {
  try {
    const meta = JSON.parse(await readFile(join(dir, 'zarr.json'), 'utf8')) as { node_type?: string }
    return meta.node_type === 'array' ? 'array' : meta.node_type === 'group' ? 'group' : null
  } catch {
    return null
  }
}

/** True if `dir` (a group) has at least one Zarr child node. Bounded peek. */
async function hasChildNodes(dir: string, depth = 0): Promise<boolean> {
  if (depth > 1) return true // beyond peek depth, assume expandable
  let entries: Dirent[]
  try { entries = await readdir(dir, { withFileTypes: true }) } catch { return false }
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const childDir = join(dir, e.name)
    if ((await nodeTypeAt(childDir)) !== null) return true
    if (await hasChildNodes(childDir, depth + 1)) return true
  }
  return false
}

export async function listChildren(store: Store, path: string): Promise<NodeEntry[]> {
  // store.url is the filesystem root the store was opened at (openLocal/create).
  const root = store.url
  const groupDir = path ? join(root, path) : root
  let entries: Dirent[]
  try { entries = await readdir(groupDir, { withFileTypes: true }) } catch { return [] }

  const out: NodeEntry[] = []
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const childDir = join(groupDir, e.name)
    const nodeType = await nodeTypeAt(childDir)
    const implicitGroup = nodeType === null ? await hasChildNodes(childDir) : false
    if (nodeType === null && !implicitGroup) continue
    out.push({
      name: e.name,
      path: path ? `${path}/${e.name}` : e.name,
      nodeType: nodeType ?? 'group',
      hasChildren: nodeType === 'array' ? false : (nodeType === null ? implicitGroup : await hasChildNodes(childDir)),
    })
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}
