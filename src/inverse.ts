/**
 * @nxr/io — inverse operator accessors.
 *
 * Reads the nxr.maps inverse kernel and forward model metadata from a
 * Zarr v3 store following the nxr.maps layout:
 *
 *   maps/                            group; attrs: schema
 *   maps/inverse/                    group; attrs: method, ch_names
 *   maps/inverse/W                   float64 [nsrc, M]
 *   maps/forward/                    group; attrs: source_ori
 *   maps/forward/source_nn           float32 [nsrc, 3]
 *   maps/forward/source_rr           float32 [nsrc, 3]
 */
import { read, meta } from './read.js';
import { attrs } from './attrs.js';
import type { Store } from './store.js';

export interface InverseData {
  W: Float64Array;
  nsrc: number;
  M: number;
  sourceOri: 'fixed' | 'free';
  sourceNn: Float32Array;
  sourceRr: Float32Array;
  method: string;
  chNames: string[];
  whitener: Float64Array | null;
  noiseCov: Float64Array | null;
}

export async function readInverse(store: Store): Promise<InverseData> {
  const inv = (await attrs.read(store, 'maps/inverse')) as Record<string, unknown>;
  const fwd = (await attrs.read(store, 'maps/forward')) as Record<string, unknown>;
  const m = await meta(store, 'maps/inverse/W');
  const [nsrc, M] = m.shape;
  const W = await read<Float64Array>(store, 'maps/inverse/W', { as: 'float64' });
  const sourceNn = await read<Float32Array>(store, 'maps/forward/source_nn', { as: 'float32' });
  const sourceRr = await read<Float32Array>(store, 'maps/forward/source_rr', { as: 'float32' });
  let whitener: Float64Array | null = null;
  let noiseCov: Float64Array | null = null;
  try { whitener = await read<Float64Array>(store, 'maps/inverse/whitener', { as: 'float64' }); } catch { /* optional */ }
  try { noiseCov = await read<Float64Array>(store, 'maps/inverse/noise_cov', { as: 'float64' }); } catch { /* optional */ }
  return {
    W,
    nsrc,
    M,
    sourceOri: (fwd.source_ori as 'fixed' | 'free') ?? 'fixed',
    sourceNn,
    sourceRr,
    method: String(inv.method ?? ''),
    chNames: (inv.ch_names as string[]) ?? [],
    whitener,
    noiseCov,
  };
}

export async function listInverse(store: Store): Promise<string[]> {
  try { await meta(store, 'maps/inverse/W'); return ['default']; } catch { return []; }
}
