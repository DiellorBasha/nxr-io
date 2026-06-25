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
import { read } from './read.js';
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
