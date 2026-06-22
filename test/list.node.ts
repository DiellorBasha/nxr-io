/** Node test for listChildren structural accessor. Run: npm run test:list */
import FileSystemStore from '@zarrita/storage/fs'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { create } from '../src/store.js'
import { attrs } from '../src/attrs.js'
import { write } from '../src/write.js'
import { listChildren } from '../src/list.js'

let failures = 0
const check = (cond: boolean, label: string): void => { if (!cond) { console.error(`  FAIL ${label}`); failures++ } }

async function main(): Promise<void> {
  const dir = path.join(os.tmpdir(), `nxr-list-${process.pid}.nxr.zarr`)
  await fs.rm(dir, { recursive: true, force: true })
  const store = create(new FileSystemStore(dir), dir)
  await attrs.write(store, '', { schema: 'nxr.subject@1.0', subject: 't' })
  await attrs.write(store, 'manifold', { schema: 'nxr.manifold@1.0', nV: 4, nF: 2 })
  await write(store, 'manifold/mesh/vertices', new Float64Array(12), { shape: [4, 3], dtype: 'float64' })
  await write(store, 'manifold/mesh/faces', new Int32Array(6), { shape: [2, 3], dtype: 'int32' })

  const roots = await listChildren(store, '')
  check(roots.some(n => n.name === 'manifold' && n.nodeType === 'group' && n.hasChildren), 'root → manifold group (expandable)')

  const man = await listChildren(store, 'manifold')
  check(man.some(n => n.name === 'mesh' && n.nodeType === 'group'), 'manifold → mesh group')

  const mesh = await listChildren(store, 'manifold/mesh')
  const verts = mesh.find(n => n.name === 'vertices')
  check(!!verts && verts.nodeType === 'array' && verts.hasChildren === false, 'mesh → vertices array (leaf)')
  check(mesh.find(n => n.name === 'faces')?.path === 'manifold/mesh/faces', 'child path is store-relative')

  console.log(failures === 0 ? '✓ listChildren walks group structure' : `✗ ${failures} failures`)
  process.exit(failures ? 1 : 0)
}
main()
