/** Node test for remove + move structural primitives. Run: npm run test:crud */
import FileSystemStore from '@zarrita/storage/fs'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { create } from '../src/store.js'
import { attrs } from '../src/attrs.js'
import { write } from '../src/write.js'
import { remove, move } from '../src/crud.js'

let failures = 0
const check = (cond: boolean, label: string): void => { if (!cond) { console.error(`  FAIL ${label}`); failures++ } }
const exists = async (p: string): Promise<boolean> => { try { await fs.stat(p); return true } catch { return false } }

async function main(): Promise<void> {
  const dir = path.join(os.tmpdir(), `nxr-crud-${process.pid}.nxr.zarr`)
  await fs.rm(dir, { recursive: true, force: true })
  const store = create(new FileSystemStore(dir), dir)
  await attrs.write(store, '', { schema: 'nxr.subject@1.0', subject: 't' })
  await attrs.write(store, 'field/height', { schema: 'nxr.field@1.0', kind: 'scalar', domain: 'vertex' })
  await write(store, 'field/height/values', new Float64Array([1, 2, 3]), { shape: [3], dtype: 'float64' })

  // move
  await move(store, 'field/height', 'field/elevation')
  check(!(await exists(path.join(dir, 'field/height'))), 'move: source gone')
  check(await exists(path.join(dir, 'field/elevation/values')), 'move: target present (with children)')
  let threw = false
  try { await move(store, 'field/missing', 'field/x') } catch { threw = true }
  check(threw, 'move: throws on missing source')
  threw = false
  try { await move(store, 'field/elevation', 'field/elevation') } catch { threw = true }
  check(threw, 'move: throws on existing target')

  // remove
  await remove(store, 'field/elevation')
  check(!(await exists(path.join(dir, 'field/elevation'))), 'remove: node gone')
  threw = false
  try { await remove(store, 'field/nope') } catch { threw = true }
  check(threw, 'remove: throws on missing node')
  threw = false
  try { await remove(store, '') } catch { threw = true }
  check(threw, 'remove: refuses empty path (store root)')

  console.log(failures === 0 ? '✓ remove + move work' : `✗ ${failures} failures`)
  process.exit(failures ? 1 : 0)
}
main()
