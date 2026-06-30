/**
 * @nxr/io — generic, type-agnostic timeseries accessors.
 *
 * A timeseries is any array whose LAST axis is time, described by attributes
 * (sfreq, n_samples, origin_sec). nxr-io never interprets `kind` — that is the
 * application's concern. Canonical layout (nxr.timeseries@1.0):
 *
 *   timeseries/<name>/        group; attrs: schema, kind, axes, sfreq,
 *                             n_samples, origin_sec, metadata_ref?
 *   timeseries/<name>/data    float32 [...dims, T]  chunked along time
 */
import { read, meta } from './read.js';
import { attrs } from './attrs.js';
import { listChildren } from './list.js';
import type { Store } from './store.js';

const BASE = 'timeseries';

export interface TimeseriesMeta {
  name: string;
  shape: number[];
  chunks: number[];
  dtype: string;
  axes: string[];
  kind: string;
  sfreq: number;
  nSamples: number;
  originSec: number;
  dims: number[];          // non-time dimensions (shape minus the last axis)
  metadataRef?: string;
}

export async function listTimeseries(store: Store): Promise<string[]> {
  try {
    const kids = await listChildren(store, BASE);
    return kids.filter((k) => k.nodeType === 'group').map((k) => k.name);
  } catch {
    return [];
  }
}

export async function readTimeseriesMeta(store: Store, name: string): Promise<TimeseriesMeta> {
  const base = `${BASE}/${name}`;
  const a = (await attrs.read(store, base)) as Record<string, unknown>;
  const m = await meta(store, `${base}/data`);
  const shape = m.shape;
  const nTimeTotal = shape[shape.length - 1];
  return {
    name,
    shape,
    chunks: m.chunks,
    dtype: m.dtype,
    axes: (a.axes as string[]) ?? [],
    kind: String(a.kind ?? ''),
    sfreq: Number(a.sfreq ?? 0),
    nSamples: Number(a.n_samples ?? nTimeTotal),
    originSec: Number(a.origin_sec ?? 0),
    dims: shape.slice(0, -1),
    metadataRef: a.metadata_ref ? String(a.metadata_ref) : undefined,
  };
}

export async function readTimeseriesWindow(
  store: Store,
  name: string,
  t0: number,
  t1: number,
): Promise<{ data: Float32Array; dims: number[]; t0: number; t1: number; nTime: number }> {
  const base = `${BASE}/${name}`;
  const m = await meta(store, `${base}/data`);
  const shape = m.shape;
  const timeAxis = shape.length - 1;
  const nTimeTotal = shape[timeAxis];
  const lo = Math.max(0, t0);
  const hi = Math.min(nTimeTotal, t1);
  const dims = shape.slice(0, -1);
  if (hi <= lo) return { data: new Float32Array(0), dims, t0: lo, t1: lo, nTime: 0 };
  const sliceSpec: [number, number][] = shape.map((s, d) => (d === timeAxis ? [lo, hi] : [0, s]));
  const data = await read<Float32Array>(store, `${base}/data`, { slice: sliceSpec, as: 'float32' });
  return { data, dims, t0: lo, t1: hi, nTime: hi - lo };
}
