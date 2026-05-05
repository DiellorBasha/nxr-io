/**
 * Node.js integration test — reads bctfsaverage5.zarr from disk
 *
 * Run: npx tsx test/read.node.ts
 */

import FileSystemStore from '@zarrita/storage/fs';
import { root } from 'zarrita';
import { read, meta, attrs, sparse } from '../src/index.js';
import type { Store } from '../src/index.js';
import type { Readable } from '@zarrita/storage';

// Path to test data
const ZARR_PATH = '../bioctreeapp/public/data/bctfsaverage5.zarr';

function openFS(path: string): Store {
  const backend = new FileSystemStore(path);
  return { location: root(backend), url: path, mode: 'r' };
}

async function main() {
  console.log('── @nxr/io node test (filesystem) ──\n');

  const store = openFS(ZARR_PATH);
  console.log('✓ Store opened from disk');

  // Root attrs
  const rootA = await attrs.read(store, '');
  console.log('✓ Root attrs:', JSON.stringify(rootA));
  assert(rootA.schema === 'bct.manifold@1.1', 'schema');

  // Eigenmodes attrs
  const eigenA = await attrs.read(store, 'manifold/eigenmodes');
  console.log('✓ Eigenmodes: K=%d, N=%d', eigenA.numModes, eigenA.numVertices);
  assert(eigenA.numModes === 1000, 'numModes');
  assert(eigenA.numVertices === 10242, 'numVertices');

  // Array metadata
  const evalMeta = await meta(store, 'manifold/eigenmodes/eigenvalues');
  console.log('✓ Eigenvalues shape:', evalMeta.shape);
  assert(evalMeta.shape[0] === 1000, 'eigenvalues shape[0]');

  // Read eigenvalues
  const eigenvalues = await read<Float64Array>(store, 'manifold/eigenmodes/eigenvalues');
  console.log('✓ Eigenvalues: %d values, first 3 = [%s]',
    eigenvalues.length,
    Array.from(eigenvalues.slice(0, 3)).map(v => v.toFixed(6)).join(', ')
  );
  assert(eigenvalues.length === 1000, 'eigenvalues length');

  // Read vertices with cast
  const verts = await read<Float32Array>(store, 'manifold/vertices', { as: 'float32' });
  console.log('✓ Vertices: %d floats (%d points)', verts.length, verts.length / 3);
  assert(verts.length === 10242 * 3, 'vertices length');

  // Read sparse mass matrix
  const mass = await sparse.read(store, 'manifold/operators/mass');
  console.log('✓ Mass matrix: %dx%d, nnz=%d', mass.shape[0], mass.shape[1], mass.nnz);
  assert(mass.shape[0] === 10242, 'mass rows');
  assert(mass.nnz > 0, 'mass nnz');

  // Read sparse stiffness matrix
  const stiff = await sparse.read(store, 'manifold/operators/stiffness');
  console.log('✓ Stiffness matrix: %dx%d, nnz=%d', stiff.shape[0], stiff.shape[1], stiff.nnz);

  // Test sparse.toCSR
  const csr = sparse.toCSR(mass);
  console.log('✓ CSR conversion: indptr[%d], indices[%d]', csr.indptr.length, csr.indices.length);
  assert(csr.indptr.length === mass.shape[0] + 1, 'CSR indptr');

  console.log('\n── All %d assertions passed ──', assertCount);
}

let assertCount = 0;
function assert(condition: boolean, label: string) {
  assertCount++;
  if (!condition) throw new Error(`Assertion failed: ${label}`);
}

main().catch((err) => {
  console.error('✗ Failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
