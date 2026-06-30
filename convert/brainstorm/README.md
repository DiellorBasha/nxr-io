# convert/brainstorm — Brainstorm → canonical Zarr (MATLAB, offline)

Pure-MATLAB export of a preprocessed Brainstorm condition into a canonical
`nxr.subject@1.0` **Zarr v2** store that `zarrita` / `@nxr/io` / the cortical-flow
app read directly. Built for MATLAB R2023b (no native `zarrcreate`/`zarrwrite`).
This is **offline** tooling — it produces the store; the app only loads it.

## Files

| File | Role |
|---|---|
| `export_canonical.m` | Driver. Mirrors one Brainstorm condition → `nxr.subject@1.0` (manifold, sensors, `sensors/recordings/<session>`, the canonical `timeseries/<session>`, and `maps` inverse/forward). |
| `nxrzarr.m` | Minimal Zarr v2 writer (uncompressed): groups, dense arrays (chunked), sparse-as-CSC, struct mirroring, plus a readback verifier. |
| `canonicalize_winding.m` | Flip face winding to canonical CCW-outward per component (signed volume) so the Zarr is the single source of truth for orientation. |
| `test_canonical.m` | Round-trip checks: `J = W · F(GoodChannels, t)` reconstructs from the store, and the canonical `timeseries/` group matches the recordings + carries the time-axis attrs. |
| `verify_winding_invariance.m` | QA: confirm the cotan Laplacian / eigenmodes are invariant to the winding flip. |

## Run (offline, in MATLAB)

```matlab
cd <repo>/vendor/nxr-io/convert/brainstorm

% Export to the default ./out/Subject01.nxr.zarr (TutorialAuditory Subject01):
store = export_canonical();
test_canonical(store);

% Or export straight to the cortical-flow dev store:
export_canonical(struct('store', ...
    '<cortical-flow>/dev-data/zarr/Subject01.nxr.zarr'));
```

Override any input via the `cfg` struct (`surfaceFile`, `kernelFile`, `dataFile`,
`channelFile`, `session`, `store`, `timeChunk`).

## Canonical store layout produced

```
Subject01.nxr.zarr/
├── manifold/mesh/{vertices,faces}      faces CCW-outward; no stored vertex_normals
├── sensors/                            channel names/types, positions, flags
│   └── recordings/<session>/{data,times}   legacy sensor-space recording (kept during migration)
├── timeseries/<session>/data           canonical nxr.timeseries@1.0 (f32 [nChan,nTime], time LAST axis,
│                                        chunked along time; time vector from attrs sfreq/n_samples/origin_sec;
│                                        kind:'sensor', metadata_ref:'sensors'; NO times array)
└── maps/{inverse/W, forward/source_rr,source_nn}   inverse kernel + forward geometry
```

The `timeseries/` group is the canonical, type-agnostic signal; it is dual-emitted
alongside `sensors/recordings/` during the migration (the app cuts over to
`timeseries/` and drops `sensors/recordings/` in a later phase).

## Notes

- **Zarr v2, uncompressed** (`compressor:null`). Compression is `@nxr/io`'s
  codec-pipeline job, not reimplemented in MATLAB.
- **`data` chunked along time** (`chunks = [nChan, timeChunk]`, default 2400) so a
  reader fetches a window without loading the whole series.
- Local-only history of the standalone prototype (incl. the superseded
  `nxr.bst_bundle@1` path: `export_bst_bundle.m`, `test_export.m`,
  `consumer/loadBundle.ts`) is preserved in the archived `research/code/bst-zarr-export`.
