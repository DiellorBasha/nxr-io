/**
 * @nxr/io — sensor channel accessors.
 *
 * Reads the MEG/EEG sensor metadata and lists recording sessions from a
 * Zarr v3 store following the nxr.sensors layout:
 *
 *   sensors/                         group; attrs: channel_names, channel_types, modalities
 *   sensors/positions                float32 [nChan, 3]
 *   sensors/flags                    int8    [nChan]  (+1 good / -1 bad)
 *   sensors/recordings/<session>/    groups
 */
import { read, meta } from './read.js';
import { attrs } from './attrs.js';
import { listChildren } from './list.js';
import type { Store } from './store.js';

export interface SensorChannelData {
  names: string[];
  types: string[];
  positions: Float32Array;
  flags: Int8Array;
}

export async function readSensorChannels(store: Store): Promise<SensorChannelData> {
  const a = (await attrs.read(store, 'sensors')) as Record<string, unknown>;
  const positions = await read<Float32Array>(store, 'sensors/positions', { as: 'float32' });
  const flags = await read<Int8Array>(store, 'sensors/flags');
  return {
    names: (a.channel_names as string[]) ?? [],
    types: (a.channel_types as string[]) ?? [],
    positions,
    flags,
  };
}

export async function listSensorRecordings(store: Store): Promise<string[]> {
  try {
    const kids = await listChildren(store, 'sensors/recordings');
    return kids.filter((k) => k.nodeType === 'group').map((k) => k.name);
  } catch { return []; }
}

// ─── Recording accessors ──────────────────────────────────────────────────────

export interface SensorRecordingData {
  data: Float32Array;
  nChan: number;
  nTime: number;
  times: Float64Array;
  sfreq: number;
  modality: string;
  dataType: 'recordings' | 'raw';
  events: { name: string; time: number; channel: number }[];
}

function parseEvents(a: Record<string, unknown>): { name: string; time: number; channel: number }[] {
  const names = (a.event_names as string[]) ?? [];
  const times = (a.event_times as number[]) ?? [];
  const chans = (a.event_channels as number[]) ?? [];
  return names.map((name, i) => ({ name, time: times[i] ?? 0, channel: chans[i] ?? -1 }));
}

export async function readSensorRecording(store: Store, session: string): Promise<SensorRecordingData> {
  const base = `sensors/recordings/${session}`;
  const a = (await attrs.read(store, base)) as Record<string, unknown>;
  const m = await meta(store, `${base}/data`);
  const [nChan, nTime] = m.shape;
  const data = await read<Float32Array>(store, `${base}/data`, { as: 'float32' });
  const times = await read<Float64Array>(store, `${base}/times`);
  return {
    data,
    nChan,
    nTime,
    times,
    sfreq: Number(a.sfreq ?? 0),
    modality: String(a.modality ?? 'MEG'),
    dataType: (a.data_type as 'recordings' | 'raw') ?? 'recordings',
    events: parseEvents(a),
  };
}

export interface SensorMeta {
  nChan: number;
  nTime: number;
  sfreq: number;
  tmin: number;
  modality: string;
  dataType: 'recordings' | 'raw';
  events: { name: string; time: number; channel: number }[];
}

/** Recording shape/time/events WITHOUT reading the data array (paging foundation). */
export async function readSensorMeta(store: Store, session: string): Promise<SensorMeta> {
  const base = `sensors/recordings/${session}`;
  const a = (await attrs.read(store, base)) as Record<string, unknown>;
  const m = await meta(store, `${base}/data`);
  const [nChan, nTime] = m.shape;
  let tmin = Number(a.tmin ?? NaN);
  if (Number.isNaN(tmin)) {
    // read.ts does not support slicing — read the full times array (tiny) and take [0]
    const times = await read<Float64Array>(store, `${base}/times`);
    tmin = times[0] ?? 0;
  }
  return {
    nChan,
    nTime,
    sfreq: Number(a.sfreq ?? 0),
    tmin,
    modality: String(a.modality ?? 'MEG'),
    dataType: (a.data_type as 'recordings' | 'raw') ?? 'recordings',
    events: parseEvents(a),
  };
}

export async function readSensorWindow(
  store: Store,
  session: string,
  s0: number,
  s1: number,
): Promise<{ data: Float32Array; nChan: number; nTime: number; times: Float64Array }> {
  const base = `sensors/recordings/${session}`;
  const m = await meta(store, `${base}/data`);
  const [nChan, nTimeTotal] = m.shape;
  const lo = Math.max(0, s0);
  const hi = Math.min(nTimeTotal, s1);
  const nTime = hi - lo;
  if (nTime <= 0) return { data: new Float32Array(0), nChan, nTime: 0, times: new Float64Array(0) };
  // Correctness-first: read full row-major [nChan, nTimeTotal] then copy the column band [lo, hi).
  // TODO(perf): replace with chunk-aligned zarrita slice once read() exposes ranges.
  const full = await read<Float32Array>(store, `${base}/data`, { as: 'float32' });
  const data = new Float32Array(nChan * nTime);
  for (let c = 0; c < nChan; c++) {
    data.set(full.subarray(c * nTimeTotal + lo, c * nTimeTotal + hi), c * nTime);
  }
  const allTimes = await read<Float64Array>(store, `${base}/times`);
  return { data, nChan, nTime, times: allTimes.slice(lo, hi) };
}
