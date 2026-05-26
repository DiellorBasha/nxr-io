#!/usr/bin/env bash
# Build the nxr-io WebAssembly module (embind). Outputs bindings/wasm/dist/.
#
# Requires Emscripten on PATH. On Homebrew's emscripten the wrapper mis-sets the
# Python var, so we point EMSDK_PYTHON at a >=3.10 interpreter ourselves.
set -euo pipefail

if [[ -z "${EMSDK_PYTHON:-}" ]]; then
  for py in /opt/homebrew/opt/python@3.14/bin/python3.14 python3.13 python3.12 python3.11 python3.10; do
    if command -v "$py" >/dev/null 2>&1; then export EMSDK_PYTHON="$py"; break; fi
  done
fi

here="$(cd "$(dirname "$0")" && pwd)"
src="$here/../bindings/wasm"
build="$src/build"
dist="$src/dist"

emcmake cmake -S "$src" -B "$build" -DCMAKE_BUILD_TYPE=Release
emmake cmake --build "$build" -j

mkdir -p "$dist"
cp "$build/nxr_io.js" "$build/nxr_io.wasm" "$dist/"
echo "✓ WASM build -> bindings/wasm/dist/nxr_io.{js,wasm}"
