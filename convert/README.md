# convert/ — upstream → canonical Zarr converters

`@nxr/io` owns the canonical `nxr.*` Zarr schema, so it is also the home for the
**converters that produce** canonical stores from upstream tools.

## Contract

- Converters are **offline / build-time** tools. They are run when *ingesting*
  upstream data to produce a canonical `nxr.subject@1.0` store (manifold,
  sensors, `timeseries/`, maps). They are **not** invoked from the cortical-flow
  app at runtime — the app only ever *loads* the resulting canonical Zarr via
  `@nxr/io`.
- Each upstream tool/modality is one subfolder: `convert/<tool>/`. Today there is
  one — `convert/brainstorm/` (MATLAB). The same pattern generalises to other
  neuroimaging software (PET/fMRI surface maps, etc.), which would land as their
  own `convert/<tool>/` and emit the identical canonical store.
- A converter may be written in any language (the Brainstorm one is MATLAB,
  because it reads Brainstorm `.mat` structures). Language-specific source under
  `convert/` is **not** part of the published JS package — `package.json`
  `files` is an allowlist (`dist`, `schema`), so `convert/` ships only in the
  repo, not in npm.

## Subfolders

| Folder | Source | Role |
|---|---|---|
| `brainstorm/` | MATLAB | Export a preprocessed Brainstorm condition (anatomy + recordings + inverse) → canonical `nxr.subject@1.0` Zarr, including the `timeseries/` group. See `brainstorm/README.md`. |
