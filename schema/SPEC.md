# nxr-io canonical schema — working spec (toward v1)

**Status:** DRAFT / in refinement. This document is the keystone of nxr-io: a single,
versioned, Zarr-centered schema that *all* nxr modules conform to (nxr-compute,
nxr-neuro/mne-cpp, nxr-viewer, nxr-meg). The `.zarr` store is the **stateful document**
that gets created, populated, analyzed, edited, and pruned over a data lifecycle. Both the
C++ CRUD engine and the TypeScript reader realize this contract.

The schema is **seeded from** nxr-compute's design-time contract (`schema/seed/`, copied
verbatim from `nxr-compute/docs/schema/`) and refined here into an **on-disk Zarr**
contract. nxr-compute's files describe *in-memory API slots* (with `implemented_by` entry
points); v1 adds the **on-disk Zarr binding** (group/array paths, dtypes, codecs, chunking)
and reconciles the competing layouts below.

---

## 1. Versioning convention (LOCKED)

From `nxr-js/io/SCHEMAS.md`, adopted as canonical:

- Format: **`<namespace>.<kind>@<major>.<minor>`** — e.g. `nxr.manifold@1.0`.
- The version string lives in the **root group's `attributes.schema`**. Readers **MUST**
  verify it before trusting the layout (C++ `open()` and the TS reader both check it).
- **Major** = breaking layout change. **Minor** = additive (new fields/arrays, same layout).
- A machine-readable schema file accompanies each `kind`; a small registry maps
  `kind@version → schema file`. Schema files also carry `version`/`schema_version`
  (inherited from the nxr-compute seed style).

## 2. Encoding conventions (LOCKED)

| Concern | Canonical v1 rule |
|---|---|
| Zarr format | v3 only (`zarr_format: 3`). |
| Chunk key encoding | `default`, separator `/` → chunks at `<array>/c/<i0>/<i1>/…`. |
| Edge chunks | Every chunk is full `chunk_shape`; partial edge chunks are **padded with `fill_value`**, never trimmed. (Verified against zarrita: codec pipeline shape = `chunk_shape`; a missing/edge chunk buffer = `prod(chunk_shape)`. The draft `NXR-IO-CPP.md §2.5` "actual smaller size" is **wrong**.) |
| Codecs (write) | `[{bytes, endian:little}, {zstd, level:0, checksum:false}]` (native Zarr v3 zstd). |
| Codecs (read) | Accept `bytes`-only (uncompressed) **and** `bytes`→`zstd`. (nxr-js currently writes uncompressed; existing nxr-io data uses zstd — both must read.) |
| Dense layout | C-order (row-major). `[V,3]`,`[F,3]` flattened row-major; `[V,K]` eigenvectors are **vMajor** (`U[v*K+k]`). |
| Sparse | **CSC group** (§4): sub-arrays `indptr`/`indices`/`data`, indices **int32**, data float64/float32; attrs `{format:"csc", shape:[rows,cols], nnz}`. Matches Eigen/geometry-central internal layout → zero-conversion C++ I/O. |
| Complex | No native Zarr complex in this stack → **`complex_interleaved`**: trailing dim of 2 (`[…,2]` re/im) or interleaved float; `dtype:"complex64|complex128"` + `storage:"complex_interleaved"` recorded in attrs. |
| dtype set | `float64 float32 int32 int64 uint8 uint32 complex64 complex128 bool` (from nxr-compute `common.meta`; `bool`→uint8). |

## 3. The fragmentation to reconcile (current reality)

Six overlapping layouts exist today. v1 unifies them.

| Source | Role | Top-level shape |
|---|---|---|
| `nxr-compute/.../manifold.schema.json` (v0.1.0) | in-memory API contract | `core/ embedding/ topology/ geometry/ operators/ eigen/ parametrization/ query/ measure/` |
| `nxr-js/manifold writer.ts` (`nxr.manifold@1.0`, on disk, **uncompressed**) | production write | `mesh/ eigenmodes/ operators/ curvature/ geometry/ dec/` |
| `nxr-js/io SCHEMAS.md` (`nxr.stc@1.0`) | production STC | `<path>/values` + `manifold_ref` cross-store reference |
| `nxr-meg-architecture.md` (aspirational) | MEG runtime | `manifold/ meg/{projection,recordings,forward,filterbanks}` (scalar+vector) |
| `dev/NXR-IO-CPP.md §10` (draft) | proposed | `manifold/ recordings/ mapping/ spectral/ results/` |
| `nxr-io/test/data/gbf_benchmark.zarr` (`nxr.gbf_bench@1.0`, **zstd**) | benchmark fixture | `forward_eeg/ noise_cov_eeg/ sources/ src/` |

Key divergences: top-level group names (`mesh` vs `manifold/core`); whether one store holds
the whole subject vs many cross-referenced single-kind stores (`nxr.stc` uses `manifold_ref`);
eigenmode nesting (`eigenmodes/` vs `eigenmodes/{scalar,vector}` vs `eigen/`); sparse attrs
(`{rows,cols,nnz}` in nxr-js vs `{shape,nnz}` in nxr-io TS).

## 4. Sparse matrices — CSC on disk (LOCKED)

Store **Compressed Sparse Column (CSC)**, not COO. Eigen's `SparseMatrix<T>` (default
column-major) and geometry-central store CSC internally, so `write_sparse` is a direct
`memcpy` of Eigen's three internal buffers (after `makeCompressed()`) with **zero
conversion**, and `read_sparse` constructs the matrix by mapping the same three arrays.
scipy (`csc_matrix`) and the legacy bioctreeapp store use the same compressed triplet, so
zarr-python / JS interop is direct.

```
<op>/                  group, attrs: {format:"csc", shape:[rows,cols], nnz:N}
├── indptr/            int32  [cols+1]      column pointers  (Eigen outerIndexPtr)
├── indices/           int32  [N]           row indices      (Eigen innerIndexPtr)
└── data/              float64|float32 [N]  values           (Eigen valuePtr)
```

- Indices are int32 (Eigen's default `StorageIndex`); brain-scale matrices stay < 2^31 nnz.
- **C++ write:** `m.makeCompressed()`, then memcpy `outerIndexPtr()[cols+1]`,
  `innerIndexPtr()[nnz]`, `valuePtr()[nnz]`. **Read:** `Eigen::Map<const SparseMatrix<T>>`
  (or direct construct) — no triplet assembly, no sort.
- **Orientation:** CSC = Eigen's default ColMajor. Symmetric operators (Laplacian, mass)
  are identical in CSC/CSR; GPU SpMV consumers wanting CSR can transpose (free for symmetric).
- **Migration:** the current nxr-io TS reader + nxr-js writer use COO (`row/col/data`) →
  both move to CSC (`indptr/indices/data`). Legacy `bct.manifold@1.1` used CSR (read-only
  Zarr v2 path, distinguished by `format`).

## 5. Canonical layout (LOCKED)

**Store model:** one stateful `<subject>.nxr.zarr` store; root `schema: "nxr.subject@1.0"`
(a profile listing the component kinds + versions). **Four top-level groups**, each a
versioned *kind* with its own sub-schema. Components are optional and filled in over the data
lifecycle (import → eigenmodes → forward → inverse → analysis); each is also valid standalone
and cross-referenceable.

```
subject.nxr.zarr/                    schema: "nxr.subject@1.0"
├── manifold/    nxr.manifold@1.0   geometry + anatomy: vertices, faces, DEC operators
│                                   (CSC), Laplacian, eigenmodes, curvature, geometry
├── field/       nxr.field@1.0      any signal ON the manifold — scalar | vector | complex,
│                                   on vertex | edge | face, optionally time-varying [T,…]
├── recordings/  nxr.recordings@1.0 original MEG/EEG SENSOR data: data [M,T], sfreq,
│                                   events, ch_info, noise_cov
└── maps/        nxr.maps@1.0       forward + inverse operators relating recordings ↔ field:
                                    leadfield, projection/inverse W, regularization
```

**Spaces & data flow.** `manifold` is the geometric substrate. `field` is signal in *source
space* (lives on the manifold). `recordings` is *sensor space*. `maps` relate them:

```
recordings (sensor)  ──inverse (maps)──▶  field (signal on manifold)
field      (source)  ──forward (maps)──▶  recordings (sensor)
```

`field` is the **unifier**: source-time-courses (`nxr.stc`), eigenmode-coefficient
reconstructions, flow/Helmholtz/spectral analysis outputs, even curvature — all are fields on
the manifold, distinguished by `{kind, domain, time_varying}`.

**Seeding map** (which existing artifact each kind starts from):

| Kind | Seed |
|---|---|
| `nxr.manifold@1.0` | nxr-compute `manifold.schema.json` + nxr-js `writer.ts` on-disk layout |
| `nxr.field@1.0` | nxr-compute `field.schema.json` (`kind/domain/time_varying`, `values`) + `nxr.stc@1.0` |
| `nxr.recordings@1.0` | `gbf_benchmark.zarr` (`*_eeg`, `noise_cov`) + nxr-meg `recordings/` |
| `nxr.maps@1.0` | leadfield (`forward_eeg/sol`) + projection `W` (nxr-meg) + GBF inverse operator |

**Field vocabulary (from the seed):** group attrs `{manifold_ref, kind: scalar|vector,
domain: vertex|edge|face, time_varying, T?, units, source: measurement|simulation|generator|derived}`;
`values` buffer `[D]` (scalar) / `[D,3]` (vector), `D ∈ {V,E,F}`; time-varying =
`[T,D]`/`[T,D,3]` frame-major float32. (The seed's gradient/divergence/isolines/… are
in-memory compute ops, not persisted slots.)

**Cross-store references** (`manifold_ref` from `nxr.stc@1.0`) remain supported for federated
use (a standalone field/recordings store referencing a manifold elsewhere); the primary model
is the single subject store.

## 6. Refinement decisions (resolved in the v1 draft) & deferred items

All Phase-0 open items are resolved and encoded in the schema files (§7):

- **Top-level structure:** four kinds `manifold / field / recordings / maps` (§5). ✓
- **Store model:** single stateful `subject.nxr.zarr` (§5). ✓
- **Sparse:** CSC `indptr/indices/data` int32, `{format:"csc", shape:[rows,cols], nnz}` (§4). ✓
- **Eigenmodes:** `manifold/eigenmodes/{scalar,vector}`; scalar float64 vMajor `[V,Ks]`;
  vector reserved as complex `[V,Kv,2]` float32. ✓
- **Complex:** trailing `[…,2]` re/im + `storage:"complex_interleaved"`. ✓
- **Field time-layout:** **`[T,D]` frame-major** (per-frame GPU upload is contiguous;
  nxr-compute convention). Legacy `nxr.stc@1.0` `[V,T]` becomes a migration. ✓
- **C++ validation depth:** structural — presence + dtype + rank/dim-token consistency. ✓

**Deferred to later minor versions:** multiple recording runs (`recordings/runs/<id>/`);
complex inverse `W` for vector GBF (`inverse/W [Ks,M,2]`, reserved); per-session analysis
sub-grouping inside `field/`.

**Freeze gate:** v1 is a *draft* until reviewed and tagged. ajv validation of the kind files
against `nxr.meta.schema.json` is wired in Phase 3 (with the JS validator + ajv-cli).

## 7. Machine-readable schema files

The canonical schema is a set of JSON files in `schema/`, loaded at runtime by both the C++
engine and the TS reader to validate a store and check versions:

| File | Role |
|---|---|
| `nxr.meta.schema.json` | JSON-Schema (2020-12) meta-schema; validates the kind files below (ajv). |
| `registry.json` | `kind@version → file` map; resolves a store's `attributes.schema`. |
| `nxr.subject.schema.json` | Root profile: the four `components` + required root attrs. |
| `nxr.manifold.schema.json` | manifold kind: `arrays`, CSC `sparse`, eigenmode `groups`. |
| `nxr.field.schema.json` | field kind: attrs + polymorphic `values` (`shape_variants`). |
| `nxr.recordings.schema.json` | recordings kind: `data [M,T]`, `events`, `noise_cov`. |
| `nxr.maps.schema.json` | maps kind: `forward/` + `inverse/` groups + arrays. |

**Kind-schema shape** (per `nxr.meta.schema.json`): `kind`, `version`, `dims` (token
glossary), `attributes` (group attrs, each `{type, const?, enum?, required}`), `arrays`
(path → `{dtype, shape, shape_variants?, storage, chunks?, required}`), `sparse` (path →
`{format:"csc", shape, data_dtype, index_dtype}`), `groups` (path → `{attributes}`), and
`components` (root profile only). Shapes use symbolic dim tokens (`V,F,E,Ks,M,T,nsrc,D`) or
integers. **Validation** = walk the store, resolve dim tokens from concrete array shapes,
check required paths exist with matching dtype + rank + consistent dims. Each component group
also carries its own `schema` attr and validates standalone.

## 8. Provenance

`schema/seed/` = verbatim copy of `nxr-compute/docs/schema/` @ 2026-05-26 (common.meta,
manifold.meta, manifold, field.meta, field, CONVENTIONS.md). These are the in-memory API
contract; v1 transforms them into the on-disk Zarr contract described here.
