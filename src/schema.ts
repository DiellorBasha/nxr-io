/**
 * @nxr/io — schema validation (parity with the C++ SchemaRegistry).
 *
 * Structural validation of a Zarr store against the canonical nxr kind schemas:
 * required attributes (incl. const `schema`), required arrays (dtype + rank),
 * CSC sparse groups, and subject components. Metadata-only — it never decodes
 * chunk data, so it works regardless of the chunk codec.
 */
import { meta } from './read.js';
import { attrs } from './attrs.js';
import { group } from './group.js';
import type { Store } from './store.js';

export interface SchemaIssue {
  path: string;
  message: string;
}

interface AttrSpec { required?: boolean; const?: unknown }
interface ArraySpec { dtype?: string; shape?: unknown[]; shape_variants?: unknown[][]; required?: boolean }
interface SparseSpec { required?: boolean }
interface ComponentSpec { kind: string; required?: boolean }

export interface KindSchema {
  kind: string;
  version: string;
  attributes?: Record<string, AttrSpec>;
  arrays?: Record<string, ArraySpec>;
  sparse?: Record<string, SparseSpec>;
  components?: Record<string, ComponentSpec>;
}

/** Map of "<namespace>.<kind>@<major>.<minor>" → loaded kind schema. */
export type Registry = Record<string, KindSchema>;

const join = (base: string, child: string): string => (base ? `${base}/${child}` : child);

/** Parse and sanity-check a store's `schema` tag (`namespace.kind@major.minor`). */
export function readSchemaTag(rootAttrs: Record<string, unknown>): {
  namespace: string; kind: string; major: number; minor: number; raw: string;
} {
  const raw = rootAttrs['schema'];
  if (typeof raw !== 'string') {
    throw new Error('[nxr/io] store is missing a string `schema` attribute');
  }
  const m = raw.match(/^([a-z0-9]+)\.([a-z0-9_]+)@(\d+)\.(\d+)$/);
  if (!m) throw new Error(`[nxr/io] malformed schema tag: "${raw}"`);
  return { namespace: m[1], kind: m[2], major: Number(m[3]), minor: Number(m[4]), raw };
}

async function isArray(store: Store, path: string): Promise<boolean> {
  try {
    await meta(store, path);
    return true;
  } catch {
    return false;
  }
}

/** Validate the node at `path` against the kind named by its `schema` attribute. */
export async function validateStore(
  store: Store,
  path: string,
  registry: Registry,
): Promise<SchemaIssue[]> {
  const issues: SchemaIssue[] = [];
  let a: Record<string, unknown>;
  try {
    a = (await attrs.read(store, path)) as Record<string, unknown>;
  } catch {
    return [{ path, message: 'no node, or attributes unreadable' }];
  }
  if (typeof a['schema'] !== 'string') {
    return [{ path, message: "missing string 'schema' attribute" }];
  }
  await validateAs(store, path, a['schema'] as string, registry, issues);
  return issues;
}

async function validateAs(
  store: Store,
  path: string,
  kindId: string,
  registry: Registry,
  issues: SchemaIssue[],
): Promise<void> {
  const schema = registry[kindId];
  if (!schema) {
    issues.push({ path, message: `unknown schema kind "${kindId}"` });
    return;
  }
  const a = (await attrs.read(store, path)) as Record<string, unknown>;

  for (const [name, spec] of Object.entries(schema.attributes ?? {})) {
    if (!(name in a)) {
      if (spec.required) issues.push({ path, message: `missing required attribute '${name}'` });
      continue;
    }
    if ('const' in spec && a[name] !== spec.const) {
      issues.push({ path, message: `attribute '${name}' must equal ${JSON.stringify(spec.const)}` });
    }
  }

  for (const [apath, spec] of Object.entries(schema.arrays ?? {})) {
    const full = join(path, apath);
    if (!(await isArray(store, full))) {
      if (spec.required) issues.push({ path: full, message: 'missing required array' });
      continue;
    }
    const m = await meta(store, full);
    if (spec.dtype && m.dtype !== spec.dtype) {
      issues.push({ path: full, message: `dtype is "${m.dtype}", expected "${spec.dtype}"` });
    }
    if (spec.shape) {
      const ranks = spec.shape_variants
        ? spec.shape_variants.map((v) => v.length)
        : [spec.shape.length];
      if (!ranks.includes(m.shape.length)) {
        issues.push({ path: full, message: `unexpected rank ${m.shape.length}` });
      }
    }
  }

  for (const [spath, spec] of Object.entries(schema.sparse ?? {})) {
    const full = join(path, spath);
    if (!(await group.exists(store, full))) {
      if (spec.required) issues.push({ path: full, message: 'missing required sparse group' });
      continue;
    }
    const sa = (await attrs.read(store, full)) as Record<string, unknown>;
    if (sa['format'] !== 'csc') issues.push({ path: full, message: "sparse 'format' must be \"csc\"" });
    for (const sub of ['indptr', 'indices', 'data']) {
      if (!(await isArray(store, join(full, sub)))) {
        issues.push({ path: full, message: `missing CSC sub-array '${sub}'` });
      }
    }
  }

  for (const [cname, spec] of Object.entries(schema.components ?? {})) {
    const full = join(path, cname);
    if (!(await group.exists(store, full))) {
      if (spec.required) issues.push({ path: full, message: `missing required component '${cname}'` });
      continue;
    }
    await validateAs(store, full, spec.kind, registry, issues);
  }
}
