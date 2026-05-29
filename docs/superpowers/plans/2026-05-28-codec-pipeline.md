# Codec Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded `bytes`+`zstd` chunk encoding in the C++ Zarr engine with a pluggable codec pipeline, so additional codecs (gzip, blosc, crc32c) and the `sharding_indexed` codec can be added later as registered entries rather than special cases — and fix the latent bug where non-zstd compressors are silently mis-decoded as zstd.

**Architecture:** Introduce a `CodecPipeline` value type that parses/serializes a Zarr v3 `codecs` array and applies an ordered chain of codecs (`encode` forward, `decode` reverse). The `bytes` array→bytes codec is a no-op on little-endian hosts (the engine's existing assumption); `bytes→bytes` compressors run after it. `ArrayMetadata` carries the parsed codec specs instead of a single `compressed` bool. `write_raw`/`read_raw` and `make_array_json` route all encode/decode/serialize through the pipeline. Phase 1 registers exactly one bytes→bytes codec — `zstd` — and throws a clear `ZarrFormatError` for any unknown codec name (this is the bug fix: today blosc/gzip are flagged `compressed=true` then fed to `zstd_decompress`, corrupting silently).

**Tech Stack:** C++17, nlohmann/json (vendored, `cpp/extern/`), libzstd (system), CMake + ctest, hand-written `test_*.cpp` using `cpp/test/check.h`.

---

## Scope note

This is the **first of several plans** that together bring the C++ engine to full Zarr v3 capability. It is self-contained: on completion the engine behaves identically on the wire (same `zarr.json`, byte-compatible with zarrita and zarr-python) but is internally extensible, and reading a non-zstd-compressed store now fails loudly instead of corrupting. Subsequent plans (region I/O, store-backend abstraction, parallel I/O, sharding, extra codecs) build on this one and are summarized at the end.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `cpp/include/nxr/io/codec_pipeline.h` | `CodecSpec` struct + `CodecPipeline` class (parse/serialize/encode/decode) | **Create** |
| `cpp/src/codec_pipeline.cpp` | `CodecPipeline` implementation; dispatches to `zstd_compress`/`zstd_decompress` | **Create** |
| `cpp/include/nxr/io/codec.h` | existing free `zstd_compress`/`zstd_decompress` (unchanged; pipeline calls these) | unchanged |
| `cpp/include/nxr/io/array_metadata.h` | replace `bool compressed` with `std::vector<CodecSpec> codecs` | **Modify** |
| `cpp/src/metadata.cpp` | `make_array_json` emits `CodecPipeline::canonical(...).to_json()`; `parse_array_json` fills `m.codecs` | **Modify** |
| `cpp/src/zarr_store.cpp` | `write_raw`/`read_raw` use `CodecPipeline::encode`/`decode` | **Modify** |
| `cpp/CMakeLists.txt` | add `src/codec_pipeline.cpp` to the library; add `codec_pipeline` test | **Modify** |
| `cpp/test/test_codec_pipeline.cpp` | unit tests for the pipeline | **Create** |

## Conventions (read before starting)

- **Build & test from the repo root** `nxr-io/`:
  - Configure: `cmake -S cpp -B cpp/build`
  - Build: `cmake --build cpp/build -j`
  - Run all: `ctest --test-dir cpp/build --output-on-failure`
  - Run one: `ctest --test-dir cpp/build -R test_codec_pipeline --output-on-failure`
- **Test style:** a test is a `main()` returning `nxrtest::finish("<name>")`; assert with `CHECK(cond)` / `CHECK_EQ(a,b)` from `cpp/test/check.h`. No external framework.
- **Endianness:** the engine assumes a little-endian host (matches `schema/SPEC.md §2`). The `bytes` codec is therefore an identity transform in `encode`/`decode`; do not byte-swap.
- **Byte-compatibility is sacred:** the `zarr.json` `codecs` array must remain identical to today's output (`{"name":"bytes","configuration":{"endian":"little"}}` then optionally `{"name":"zstd","configuration":{"checksum":false,"level":<n>}}`). The cross-language tests (`npm run test:crosslang`) and `test_read_existing` are the guardrails.

---

### Task 1: `CodecSpec` + `CodecPipeline` skeleton (canonical + serialize)

**Files:**
- Create: `cpp/include/nxr/io/codec_pipeline.h`
- Create: `cpp/src/codec_pipeline.cpp`
- Create: `cpp/test/test_codec_pipeline.cpp`
- Modify: `cpp/CMakeLists.txt:25-33` (add source) and `cpp/CMakeLists.txt:47` (add test)

- [ ] **Step 1: Create the header**

`cpp/include/nxr/io/codec_pipeline.h`:

```cpp
// nxr-io — Zarr v3 codec pipeline. An ordered chain whose first element is the
// array->bytes codec (`bytes`, identity on little-endian hosts) followed by
// bytes->bytes codecs (compressors). encode() applies them in order; decode()
// in reverse. Unknown codec names throw ZarrFormatError.
#pragma once
#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>
#include <nlohmann/json.hpp>

namespace nxr::io {

// One entry of the codec chain: its Zarr v3 `name` and `configuration` object.
struct CodecSpec {
  std::string name;
  nlohmann::json configuration = nlohmann::json::object();
};

class CodecPipeline {
 public:
  CodecPipeline() = default;
  // Construct from already-parsed specs (e.g. from ArrayMetadata). Validates names.
  explicit CodecPipeline(std::vector<CodecSpec> specs);

  // Build from a zarr.json `codecs` JSON array. Throws ZarrFormatError if the
  // first codec is not `bytes`, or any codec name is unsupported.
  static CodecPipeline from_json(const nlohmann::json& codecs);

  // The canonical nxr pipeline: [bytes(little)] (+ zstd{level} when compress).
  static CodecPipeline canonical(bool compress, int zstd_level);

  // Serialize to a zarr.json `codecs` array (byte-identical to make_array_json's
  // historical output).
  nlohmann::json to_json() const;

  // Encode a raw chunk buffer (chunk_shape-sized, C-order) to stored bytes.
  std::vector<std::uint8_t> encode(const std::uint8_t* data, std::size_t nbytes) const;

  // Decode stored chunk bytes back to exactly raw_size bytes of raw chunk data.
  std::vector<std::uint8_t> decode(const std::uint8_t* data, std::size_t nbytes,
                                   std::size_t raw_size) const;

  const std::vector<CodecSpec>& specs() const { return specs_; }

 private:
  void validate() const;  // throws ZarrFormatError on a bad chain
  std::vector<CodecSpec> specs_;
};

}  // namespace nxr::io
```

- [ ] **Step 2: Write the failing test**

`cpp/test/test_codec_pipeline.cpp`:

```cpp
#include "nxr/io/codec_pipeline.h"
#include "check.h"
#include <cstdint>
#include <vector>

using namespace nxr::io;

int main() {
  // canonical(compress=true) serializes to [bytes(little), zstd(level,checksum)].
  const nlohmann::json j = CodecPipeline::canonical(/*compress=*/true, /*zstd_level=*/0).to_json();
  CHECK(j.is_array());
  CHECK_EQ(j.size(), static_cast<std::size_t>(2));
  CHECK_EQ(j.at(0).at("name").get<std::string>(), std::string("bytes"));
  CHECK_EQ(j.at(0).at("configuration").at("endian").get<std::string>(), std::string("little"));
  CHECK_EQ(j.at(1).at("name").get<std::string>(), std::string("zstd"));
  CHECK_EQ(j.at(1).at("configuration").at("level").get<int>(), 0);
  CHECK_EQ(j.at(1).at("configuration").at("checksum").get<bool>(), false);

  // canonical(compress=false) serializes to [bytes(little)] only.
  const nlohmann::json j0 = CodecPipeline::canonical(/*compress=*/false, 0).to_json();
  CHECK_EQ(j0.size(), static_cast<std::size_t>(1));
  CHECK_EQ(j0.at(0).at("name").get<std::string>(), std::string("bytes"));

  return nxrtest::finish("codec_pipeline");
}
```

- [ ] **Step 3: Add the source + test to CMake**

In `cpp/CMakeLists.txt`, add `src/codec_pipeline.cpp` to the `add_library(nxr_io ...)` list (after `src/codec_zstd.cpp`):

```cmake
add_library(nxr_io
  src/codec_zstd.cpp
  src/codec_pipeline.cpp
  src/dtype.cpp
  src/metadata.cpp
  src/chunking.cpp
  src/zarr_store.cpp
  src/sparse.cpp
  src/schema.cpp
)
```

And add `codec_pipeline` to the test list (line 47):

```cmake
  set(NXR_IO_TESTS codec codec_pipeline dtype array_io groups read_existing crud sparse schema)
```

- [ ] **Step 4: Run the test to verify it fails to build**

Run: `cmake -S cpp -B cpp/build && cmake --build cpp/build -j`
Expected: link/compile error — `codec_pipeline.cpp` does not exist / undefined `CodecPipeline::canonical`.

- [ ] **Step 5: Implement `canonical` + `to_json`**

`cpp/src/codec_pipeline.cpp`:

```cpp
#include "nxr/io/codec_pipeline.h"

#include "nxr/io/codec.h"
#include "nxr/io/errors.h"

namespace nxr::io {

using nlohmann::json;

CodecPipeline::CodecPipeline(std::vector<CodecSpec> specs) : specs_(std::move(specs)) {
  validate();
}

CodecPipeline CodecPipeline::canonical(bool compress, int zstd_level) {
  std::vector<CodecSpec> specs;
  specs.push_back(CodecSpec{"bytes", json{{"endian", "little"}}});
  if (compress) {
    specs.push_back(CodecSpec{"zstd", json{{"level", zstd_level}, {"checksum", false}}});
  }
  return CodecPipeline(std::move(specs));
}

nlohmann::json CodecPipeline::to_json() const {
  json arr = json::array();
  for (const auto& s : specs_) {
    arr.push_back({{"name", s.name}, {"configuration", s.configuration}});
  }
  return arr;
}

// Defined in later steps:
CodecPipeline CodecPipeline::from_json(const nlohmann::json& codecs) {
  std::vector<CodecSpec> specs;
  for (const auto& c : codecs) {
    specs.push_back(CodecSpec{c.value("name", std::string()),
                              c.value("configuration", json::object())});
  }
  return CodecPipeline(std::move(specs));
}

void CodecPipeline::validate() const {
  if (specs_.empty() || specs_.front().name != "bytes") {
    throw ZarrFormatError("[nxr/io] codec pipeline must begin with the `bytes` codec");
  }
  for (std::size_t i = 1; i < specs_.size(); ++i) {
    if (specs_[i].name != "zstd") {
      throw ZarrFormatError("[nxr/io] unsupported codec \"" + specs_[i].name + "\"");
    }
  }
}

std::vector<std::uint8_t> CodecPipeline::encode(const std::uint8_t* data,
                                                std::size_t nbytes) const {
  std::vector<std::uint8_t> buf(data, data + nbytes);  // `bytes` codec: identity on LE
  for (std::size_t i = 1; i < specs_.size(); ++i) {
    const int level = specs_[i].configuration.value("level", 0);
    buf = zstd_compress(buf.data(), buf.size(), level);
  }
  return buf;
}

std::vector<std::uint8_t> CodecPipeline::decode(const std::uint8_t* data, std::size_t nbytes,
                                                std::size_t raw_size) const {
  std::vector<std::uint8_t> buf(data, data + nbytes);
  for (std::size_t k = specs_.size(); k > 1; --k) {
    const std::size_t i = k - 1;          // bytes->bytes codec index
    const std::size_t expected = (i == 1) ? raw_size : 0;  // i==1 yields raw bytes
    buf = zstd_decompress(buf.data(), buf.size(), expected);
  }
  return buf;  // `bytes` codec (index 0): identity on LE
}

}  // namespace nxr::io
```

(`from_json`, `encode`, and `decode` are implemented here too because they share the file; their dedicated tests come in Tasks 2–3.)

- [ ] **Step 6: Build and run the test**

Run: `cmake --build cpp/build -j && ctest --test-dir cpp/build -R test_codec_pipeline --output-on-failure`
Expected: `PASS codec_pipeline` and ctest reports `100% tests passed`.

- [ ] **Step 7: Commit**

```bash
git add cpp/include/nxr/io/codec_pipeline.h cpp/src/codec_pipeline.cpp \
        cpp/test/test_codec_pipeline.cpp cpp/CMakeLists.txt
git commit -m "feat(cpp): add CodecPipeline skeleton (canonical + to_json)"
```

---

### Task 2: Pipeline `encode`/`decode` round-trip

**Files:**
- Modify: `cpp/test/test_codec_pipeline.cpp`
- (implementation already added in Task 1 Step 5)

- [ ] **Step 1: Add a round-trip test**

Append before `return nxrtest::finish(...)` in `cpp/test/test_codec_pipeline.cpp`:

```cpp
  // Round-trip a compressible buffer through the compressed pipeline.
  std::vector<std::uint8_t> raw(8000);
  for (std::size_t i = 0; i < raw.size(); ++i) raw[i] = static_cast<std::uint8_t>(i % 7);

  const CodecPipeline zpipe = CodecPipeline::canonical(/*compress=*/true, 0);
  const std::vector<std::uint8_t> enc = zpipe.encode(raw.data(), raw.size());
  CHECK(enc.size() < raw.size());  // patterned data must compress
  const std::vector<std::uint8_t> dec = zpipe.decode(enc.data(), enc.size(), raw.size());
  CHECK(dec == raw);

  // The uncompressed pipeline is a pass-through.
  const CodecPipeline bpipe = CodecPipeline::canonical(/*compress=*/false, 0);
  const std::vector<std::uint8_t> encb = bpipe.encode(raw.data(), raw.size());
  CHECK(encb == raw);
  const std::vector<std::uint8_t> decb = bpipe.decode(encb.data(), encb.size(), raw.size());
  CHECK(decb == raw);
```

- [ ] **Step 2: Run the test**

Run: `cmake --build cpp/build -j && ctest --test-dir cpp/build -R test_codec_pipeline --output-on-failure`
Expected: `PASS codec_pipeline` (the implementation from Task 1 already satisfies this).

- [ ] **Step 3: Commit**

```bash
git add cpp/test/test_codec_pipeline.cpp
git commit -m "test(cpp): CodecPipeline encode/decode round-trip"
```

---

### Task 3: `from_json` parsing + unknown-codec rejection (the bug fix)

**Files:**
- Modify: `cpp/test/test_codec_pipeline.cpp`
- (implementation already added in Task 1 Step 5)

- [ ] **Step 1: Add parsing + rejection tests**

Append before `return nxrtest::finish(...)`:

```cpp
  // Parse a real [bytes, zstd] codecs array.
  const nlohmann::json codecs_arr = nlohmann::json::array({
      {{"name", "bytes"}, {"configuration", {{"endian", "little"}}}},
      {{"name", "zstd"}, {"configuration", {{"level", 3}, {"checksum", false}}}},
  });
  const CodecPipeline parsed = CodecPipeline::from_json(codecs_arr);
  CHECK_EQ(parsed.specs().size(), static_cast<std::size_t>(2));
  CHECK_EQ(parsed.specs()[1].name, std::string("zstd"));

  // An unsupported codec (e.g. blosc) must throw, not silently mis-decode.
  bool threw = false;
  try {
    CodecPipeline::from_json(nlohmann::json::array({
        {{"name", "bytes"}, {"configuration", {{"endian", "little"}}}},
        {{"name", "blosc"}, {"configuration", nlohmann::json::object()}},
    }));
  } catch (const std::exception&) {
    threw = true;
  }
  CHECK(threw);

  // A pipeline that does not start with `bytes` must throw.
  bool threw2 = false;
  try {
    CodecPipeline::from_json(nlohmann::json::array({
        {{"name", "zstd"}, {"configuration", nlohmann::json::object()}},
    }));
  } catch (const std::exception&) {
    threw2 = true;
  }
  CHECK(threw2);
```

- [ ] **Step 2: Run the test**

Run: `cmake --build cpp/build -j && ctest --test-dir cpp/build -R test_codec_pipeline --output-on-failure`
Expected: `PASS codec_pipeline`.

- [ ] **Step 3: Commit**

```bash
git add cpp/test/test_codec_pipeline.cpp
git commit -m "test(cpp): CodecPipeline parses codecs array and rejects unknown codecs"
```

---

### Task 4: Carry codec specs in `ArrayMetadata`; wire `metadata.cpp`

**Files:**
- Modify: `cpp/include/nxr/io/array_metadata.h:10-17`
- Modify: `cpp/src/metadata.cpp:24-41` (make_array_json) and `cpp/src/metadata.cpp:59-67` (parse_array_json)

- [ ] **Step 1: Replace `compressed` with `codecs` in `ArrayMetadata`**

`cpp/include/nxr/io/array_metadata.h` — change the struct to:

```cpp
// nxr-io — array metadata (parsed from zarr.json).
#pragma once
#include <cstdint>
#include <vector>
#include <nlohmann/json.hpp>
#include "nxr/io/types.h"
#include "nxr/io/codec_pipeline.h"

namespace nxr::io {

struct ArrayMetadata {
  std::vector<std::int64_t> shape;
  std::vector<std::int64_t> chunks;
  DType dtype = DType::Float64;
  double fill_value = 0.0;
  std::vector<CodecSpec> codecs;  // parsed codec chain (begins with `bytes`)
  nlohmann::json attributes = nlohmann::json::object();
};

}  // namespace nxr::io
```

- [ ] **Step 2: Route `make_array_json` through the pipeline**

In `cpp/src/metadata.cpp`, add the include at the top (after the existing `#include`s):

```cpp
#include "nxr/io/codec_pipeline.h"
```

Replace the body of `make_array_json` (the manual `codecs` array build, lines 24-29) so the `codecs` field comes from the pipeline. The function becomes:

```cpp
nlohmann::json make_array_json(DType dtype, const std::vector<std::int64_t>& shape,
                               const std::vector<std::int64_t>& chunks, double fill_value,
                               bool compress, int zstd_level,
                               const nlohmann::json& attributes) {
  return json{
      {"zarr_format", 3},
      {"node_type", "array"},
      {"shape", shape},
      {"data_type", dtype_to_string(dtype)},
      {"chunk_grid", {{"name", "regular"}, {"configuration", {{"chunk_shape", chunks}}}}},
      {"chunk_key_encoding", {{"name", "default"}, {"configuration", {{"separator", "/"}}}}},
      {"fill_value", fill_value_json(dtype, fill_value)},
      {"codecs", CodecPipeline::canonical(compress, zstd_level).to_json()},
      {"attributes", attributes.is_null() ? json::object() : attributes},
  };
}
```

- [ ] **Step 3: Fill `m.codecs` in `parse_array_json`**

Replace the `m.compressed = false; if (j.contains("codecs")) { ... }` block (lines 59-67) with:

```cpp
  if (j.contains("codecs")) {
    m.codecs = CodecPipeline::from_json(j.at("codecs")).specs();
  } else {
    m.codecs = CodecPipeline::canonical(/*compress=*/false, 0).specs();  // lenient default
  }
```

- [ ] **Step 4: Build to surface remaining `compressed` references**

Run: `cmake --build cpp/build -j`
Expected: compile error in `cpp/src/zarr_store.cpp` (`read_raw` still references `out_meta.compressed`). This is fixed in Task 5.

- [ ] **Step 5: Commit (after Task 5 builds clean — see note)**

Do not commit yet; `zarr_store.cpp` is mid-change. Proceed to Task 5, then commit both together in Task 5 Step 4.

---

### Task 5: Route `write_raw`/`read_raw` through the pipeline

**Files:**
- Modify: `cpp/src/zarr_store.cpp:201-203` (write encode) and `cpp/src/zarr_store.cpp:234-238` (read decode)

- [ ] **Step 1: Add the include**

At the top of `cpp/src/zarr_store.cpp`, add (next to the other `nxr/io` includes):

```cpp
#include "nxr/io/codec_pipeline.h"
```

- [ ] **Step 2: Use the pipeline in `write_raw`**

In `write_raw`, just before the chunk loop (`for (std::int64_t c = 0; c < ngrid; ++c)`), construct the pipeline once:

```cpp
  const CodecPipeline pipe = CodecPipeline::canonical(opts.compress, opts.zstd_level);
```

Then replace the encode line (currently):

```cpp
    std::vector<std::uint8_t> enc =
        opts.compress ? zstd_compress(chunkbuf.data(), chunkbuf.size(), opts.zstd_level)
                      : std::move(chunkbuf);
```

with:

```cpp
    std::vector<std::uint8_t> enc = pipe.encode(chunkbuf.data(), chunkbuf.size());
```

- [ ] **Step 3: Use the pipeline in `read_raw`**

In `read_raw`, just before the chunk loop, construct the pipeline from the parsed metadata:

```cpp
  const CodecPipeline pipe(out_meta.codecs);
```

Then replace the decode block (currently):

```cpp
      std::vector<std::uint8_t> dec =
          out_meta.compressed
              ? zstd_decompress(enc.data(), enc.size(), static_cast<std::size_t>(chunk_elems) * itemsize)
              : std::move(enc);
      if (dec.size() != static_cast<std::size_t>(chunk_elems) * itemsize) {
        throw ZarrFormatError("[nxr/io] decoded chunk size mismatch at \"" + path + "\"");
      }
```

with:

```cpp
      const std::size_t raw_size = static_cast<std::size_t>(chunk_elems) * itemsize;
      std::vector<std::uint8_t> dec = pipe.decode(enc.data(), enc.size(), raw_size);
      if (dec.size() != raw_size) {
        throw ZarrFormatError("[nxr/io] decoded chunk size mismatch at \"" + path + "\"");
      }
```

- [ ] **Step 4: Build the whole library + run the full C++ suite**

Run: `cmake --build cpp/build -j && ctest --test-dir cpp/build --output-on-failure`
Expected: all tests `PASS`, including `test_array_io`, `test_crud`, `test_read_existing` (reads the zstd-compressed `gbf_benchmark.zarr` fixture), and `test_codec_pipeline`. `100% tests passed`.

- [ ] **Step 5: Commit Tasks 4 + 5 together**

```bash
git add cpp/include/nxr/io/array_metadata.h cpp/src/metadata.cpp cpp/src/zarr_store.cpp
git commit -m "refactor(cpp): route chunk encode/decode through CodecPipeline; drop compressed bool"
```

---

### Task 6: Cross-language + WASM regression guard

**Files:** none modified — this task only runs existing cross-checks to prove byte-compatibility held.

- [ ] **Step 1: Regenerate the cross-language fixture and read it from zarrita**

Run:
```bash
cmake --build cpp/build -j --target nxr_io_gen
npm run test:crosslang
```
Expected: the TypeScript/zarrita reader reads the C++-written store and all assertions pass (proves the `codecs` JSON and chunk bytes are unchanged).

- [ ] **Step 2: Confirm the existing-data read path**

Run: `ctest --test-dir cpp/build -R test_read_existing --output-on-failure`
Expected: `PASS read_existing` — the zstd-compressed benchmark store still decodes through the new pipeline.

- [ ] **Step 3: (If the WASM toolchain is installed) rebuild and smoke-test WASM**

Run:
```bash
npm run build:wasm
npm run test:wasm
```
Expected: `nxr_io.wasm` builds and the smoke test passes. If Emscripten is not installed, note it and skip — no code in this plan changes WASM behavior.

- [ ] **Step 4: Commit (only if any generated fixture under version control changed)**

```bash
git add -A
git commit -m "test: regenerate cross-language fixture after codec pipeline refactor"
```
If `git status` shows nothing to commit, skip this step.

---

## Self-Review

- **Spec coverage:** the codec-pipeline portion of the larger scope ("a pluggable codec pipeline; throws clear error for unknown codecs; same wire format") is covered by Tasks 1–5; byte-compatibility is verified in Task 6. ✓
- **Type consistency:** `CodecSpec`/`CodecPipeline` names, `canonical(bool,int)`, `from_json(json)`, `to_json()`, `encode(ptr,n)`, `decode(ptr,n,raw_size)`, `specs()`, and the `ArrayMetadata::codecs` field are used identically across header, impl, metadata.cpp, and zarr_store.cpp. The `bool compressed` field is fully removed and every reader updated (metadata.cpp, zarr_store.cpp). ✓
- **No placeholders:** every code step shows complete code; commands have expected output. ✓

---

## Subsequent Plans (roadmap — each to be expanded into its own plan)

These build on the codec pipeline and are ordered by dependency. Each is a separate, independently testable deliverable.

1. **Region (partial-chunk) I/O** — add `read_region(path, offset, shape)` / `write_region(...)` driven by the existing `chunking.cpp` grid math; whole-array read/write become wrappers. Precondition for lazy reads and useful parallelism. *Largest correctness payoff for big data.*
2. **Store backend abstraction** — extract a `Store` interface (`get`, `get_partial`, `set`, `delete`, `list`) from the raw `std::filesystem` calls; implementations: filesystem, in-memory, and an HTTP range-request backend (the latter is what could let the WASM build subsume the TS reader).
3. **Parallel I/O** — a bounded thread pool over the per-chunk encode/decode/file ops (independent units after region I/O). Native-default, WASM-optional (requires pthreads + SharedArrayBuffer + COOP/COEP); serial fallback when threads are unavailable.
4. **Sharding (`sharding_indexed` codec)** — implemented as a codec entry from this plan's pipeline: inner chunk grid + offset/length index (with crc32c) + `Store::get_partial` for sub-chunk reads. Fixes the many-tiny-files problem at brain scale.
5. **Additional codecs** — register `gzip`, `blosc` (pulls in c-blosc2), `crc32c` (checksum), `transpose` (array→array) in the pipeline's supported set, validated against zarr-python as an oracle.
