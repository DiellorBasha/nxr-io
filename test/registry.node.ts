/** Node test for the public loadRegistry() API. Run: npm run test:registry */
import { loadRegistry } from '../src/registry.js';

let failures = 0;
const check = (cond: boolean, label: string): void => {
  if (!cond) { console.error(`  FAIL ${label}`); failures++; }
};

const reg = loadRegistry();
check(!!reg['nxr.manifold@1.0'], 'manifold kind present');
check(reg['nxr.manifold@1.0']?.kind === 'nxr.manifold', 'manifold kind id');
check(!!reg['nxr.field@1.0'], 'field kind present');
check(!!reg['nxr.subject@1.0'], 'subject kind present');
check(Object.keys(reg).length >= 5, 'all 5 kinds loaded');

console.log(failures === 0 ? '✓ loadRegistry loads all kind schemas' : `✗ ${failures} failures`);
process.exit(failures ? 1 : 0);
