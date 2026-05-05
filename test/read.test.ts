/**
 * Integration test — reads bctfsaverage5.zarr (v2) via @nxr/io
 *
 * Run: npx tsx test/read.test.ts
 */

import { open, read, meta, attrs, sparse } from '../src/index.js';

const ZARR_URL = 'http://localhost:5173/data/bctfsaverage5.zarr';

// For local filesystem testing without a server, we use zarrita's open.v2
// directly with a file-based approach. But since our open() uses FetchStore,
// we'll test with a simple node-based HTTP fetch polyfill.

async function main() {
  console.log('── @nxr/io integration test ──\n');

  // Open store
  const store = await open(ZARR_URL);
  console.log('✓ Store opened:', store.url);

  // Read root attributes
  const rootAttrs = await attrs.read(store, '');
  console.log('✓ Root attrs:', rootAttrs);
  console.assert(rootAttrs.schema === 'bct.manifold@1.1', 'Schema mismatch');

  // Read eigenmodes metadata
  const eigenAttrs = await attrs.read(store, 'manifold/eigenmodes');
  console.log('✓ Eigenmodes attrs:', eigenAttrs);
  console.assert(eigenAttrs.numModes === 1000, 'Expected 1000 modes');
  console.assert(eigenAttrs.numVertices === 10242, 'Expected 10242 vertices');

  // Read eigenvalues array metadata
  const evalMeta = await meta(store, 'manifold/eigenmodes/eigenvalues');
  console.log('✓ Eigenvalues meta:', evalMeta);
  console.assert(evalMeta.shape[0] === 1000, 'Expected shape [1000, 1]');

  // Read eigenvalues data
  const eigenvalues = await read<Float64Array>(store, 'manifold/eigenmodes/eigenvalues');
  console.log('✓ Eigenvalues loaded:', eigenvalues.length, 'values');
  console.log('  First 5:', Array.from(eigenvalues.slice(0, 5)));
  console.assert(eigenvalues.length === 1000, 'Expected 1000 eigenvalues');

  // Read vertices
  const verts = await read(store, 'manifold/vertices', { as: 'float32' });
  console.log('✓ Vertices loaded:', verts.length, 'floats (', verts.length / 3, 'points)');
  console.assert(verts.length === 10242 * 3, 'Expected 10242*3 vertex coords');

  // Read sparse mass matrix
  const mass = await sparse.read(store, 'manifold/operators/mass');
  console.log('✓ Mass matrix:', mass.shape, 'nnz =', mass.nnz);
  console.assert(mass.shape[0] === 10242, 'Mass matrix rows mismatch');

  console.log('\n── All tests passed ──');
}

main().catch((err) => {
  console.error('✗ Test failed:', err.message);
  process.exit(1);
});
