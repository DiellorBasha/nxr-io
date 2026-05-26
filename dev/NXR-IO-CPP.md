# nxr-io: Zarr v3 Reader/Writer for C++

## Design & Implementation Document

**Purpose**: This document specifies a standalone C++ library (`nxr-io`) that reads and writes Zarr v3 stores. It is the I/O foundation for the nxr neuroimaging system. Claude Code should use this document to implement the library from scratch.

---

## 1. What nxr-io Is

nxr-io is a **general-purpose Zarr v3 reader/writer** in C++17. It has no domain knowledge — it does not know about MEG, EEG, cortical surfaces, or eigenmodes. It reads and writes typed n-dimensional arrays to Zarr v3 stores on the local filesystem with blosc2 compression.

### What nxr-io is NOT
- Not an MEG/EEG library (that is nxr-neuro)
- Not a geometry processing library (that is nxr-compute)
- Not a Zarr v2 library — it targets Zarr v3 exclusively
- Not a cloud storage library — local filesystem only (for now)

### Dependencies (strict — no others permitted)
- **nlohmann/json** (header-only, JSON metadata)
- **c-blosc2** (compression/decompression)
- **Eigen 3.4+** (header-only, for convenience overloads accepting Eigen types)
- **C++17 standard library** (`<filesystem>`, `<fstream>`, `<vector>`, `<optional>`, `<variant>`)

No Qt. No xtensor. No protobuf. No abseil. No Boost.

---

## 2. Zarr v3 On-Disk Format

The implementer must understand that a Zarr v3 store is just a directory tree. There is no binary container format, no global index, no file headers on chunk files.

### 2.1 Directory Structure

```
store.zarr/
├── zarr.json                      # root group metadata
├── groupA/
│   ├── zarr.json                  # group metadata
│   └── arrayX/
│       ├── zarr.json              # array metadata (shape, dtype, chunks, codecs)
│       └── c/                     # chunk storage directory
│           ├── 0/0                # chunk at grid position [0, 0]
│           ├── 0/1                # chunk at grid position [0, 1]
│           └── 1/0                # chunk at grid position [1, 0]
```

### 2.2 Group Metadata (`zarr.json`)

```json
{
    "zarr_format": 3,
    "node_type": "group",
    "attributes": {
        "arbitrary_key": "arbitrary_value"
    }
}
```

- `zarr_format` is always `3` (integer, not string)
- `node_type` is always `"group"`
- `attributes` is an arbitrary JSON object (can be empty `{}`)

### 2.3 Array Metadata (`zarr.json`)

```json
{
    "zarr_format": 3,
    "node_type": "array",
    "shape": [306, 600000],
    "data_type": "float64",
    "chunk_grid": {
        "name": "regular",
        "configuration": {
            "chunk_shape": [306, 4000]
        }
    },
    "chunk_key_encoding": {
        "name": "default",
        "configuration": {
            "separator": "/"
        }
    },
    "fill_value": 0.0,
    "codecs": [
        {
            "name": "bytes",
            "configuration": {
                "endian": "little"
            }
        },
        {
            "name": "blosc",
            "configuration": {
                "cname": "zstd",
                "clevel": 5,
                "shuffle": "shuffle",
                "typesize": 8,
                "blocksize": 0
            }
        }
    ],
    "attributes": {}
}
```

Key fields:
- `data_type`: one of `"bool"`, `"int8"`, `"int16"`, `"int32"`, `"int64"`, `"uint8"`, `"uint16"`, `"uint32"`, `"uint64"`, `"float32"`, `"float64"`
- `chunk_grid`: only `"regular"` grid is required
- `chunk_key_encoding`: use `"default"` with separator `"/"`
- `fill_value`: must match the data type. Use `0` for integers, `0.0` for floats
- `codecs`: an ordered pipeline. For our purposes, always `bytes` (endianness) → `blosc` (compression)

### 2.4 Chunk Files

Each chunk file is a raw binary blob — the output of the codec pipeline applied to the chunk's data. **No header, no length prefix, no framing.** Just the compressed bytes.

Chunk file path: `<array_path>/c/<i0>/<i1>/.../<iN>` where `i0...iN` are the chunk grid indices.

### 2.5 Edge Chunks

When the array shape is not evenly divisible by the chunk shape, edge chunks are smaller. For example, a `[306, 600000]` array with chunk shape `[306, 4000]` has 150 full chunks. If the shape were `[306, 601000]`, chunk `[0, 150]` would contain only `[306, 1000]` elements. Edge chunks are stored as their actual (smaller) size, not padded to full chunk size.

### 2.6 Supported Data Types

The library must support the following type mapping:

| Zarr data_type | C++ type      | typesize (bytes) |
|---------------|---------------|-----------------|
| `"float32"`   | `float`       | 4               |
| `"float64"`   | `double`      | 8               |
| `"int32"`     | `int32_t`     | 4               |
| `"int64"`     | `int64_t`     | 8               |
| `"uint8"`     | `uint8_t`     | 1               |
| `"uint16"`    | `uint16_t`    | 2               |
| `"uint32"`    | `uint32_t`    | 4               |
| `"bool"`      | `uint8_t`     | 1               |

---

## 3. Public API

All public API lives in namespace `nxr::io`. The primary class is `ZarrStore`.

### 3.1 ZarrStore

```cpp
namespace nxr::io {

class ZarrStore {
public:
    /// Open or create a Zarr v3 store at the given filesystem path.
    /// Creates the root directory and root zarr.json if they don't exist.
    explicit ZarrStore(const std::filesystem::path& root);

    /// --- Group operations ---

    /// Create a group node. Creates intermediate directories as needed.
    /// If the group already exists, updates its attributes.
    void write_group(const std::string& path,
                     const nlohmann::json& attributes = {});

    /// --- Array write operations ---

    /// Write an array from a raw pointer. This is the core write function.
    /// All other write overloads delegate to this.
    ///
    /// @param path     Zarr path, e.g. "/manifold/vertices"
    /// @param data     Pointer to contiguous, C-order (row-major) data
    /// @param shape    Array dimensions, e.g. {n_vertices, 3}
    /// @param options  Chunking, compression, and attribute options
    template <typename T>
    void write_array(const std::string& path,
                     const T* data,
                     const std::vector<int64_t>& shape,
                     const WriteOptions& options = {});

    /// Write from std::vector (1D array)
    template <typename T>
    void write_array(const std::string& path,
                     const std::vector<T>& data,
                     const WriteOptions& options = {});

    /// Write from Eigen::VectorXd / VectorXf / VectorXi
    template <typename Derived>
    void write_array(const std::string& path,
                     const Eigen::MatrixBase<Derived>& vec,
                     const WriteOptions& options = {});

    /// Write from Eigen::MatrixXd / MatrixXf / MatrixXi (row-major or col-major)
    /// Handles Eigen's default column-major storage by transposing to row-major
    /// before writing, so the on-disk layout is always C-order.
    template <typename Derived>
    void write_matrix(const std::string& path,
                      const Eigen::MatrixBase<Derived>& mat,
                      const WriteOptions& options = {});

    /// Write a sparse matrix in COO format as three arrays under a group:
    ///   path/row_indices   [nnz] int64
    ///   path/col_indices   [nnz] int64
    ///   path/values        [nnz] float64
    ///   path/zarr.json     attrs: {"format": "coo", "shape": [rows, cols], "nnz": N}
    template <typename Scalar>
    void write_sparse(const std::string& path,
                      const Eigen::SparseMatrix<Scalar>& mat,
                      const WriteOptions& options = {});

    /// --- Array read operations ---

    /// Read array metadata without loading data.
    ArrayMetadata read_metadata(const std::string& path) const;

    /// Read full array into a std::vector.
    template <typename T>
    std::vector<T> read_array(const std::string& path) const;

    /// Read full array into an Eigen::VectorXd (1D) or Eigen::MatrixXd (2D).
    /// For 2D arrays, converts from C-order on disk to Eigen's column-major.
    Eigen::MatrixXd read_matrix(const std::string& path) const;

    /// Read a single chunk by its grid indices.
    /// Returns raw decompressed bytes as a vector.
    template <typename T>
    std::vector<T> read_chunk(const std::string& path,
                              const std::vector<int64_t>& chunk_indices) const;

    /// Read a sparse matrix from COO group format.
    template <typename Scalar = double>
    Eigen::SparseMatrix<Scalar> read_sparse(const std::string& path) const;

    /// --- Store inspection ---

    /// Check if a path exists in the store (group or array).
    bool exists(const std::string& path) const;

    /// Check if a path is a group.
    bool is_group(const std::string& path) const;

    /// Check if a path is an array.
    bool is_array(const std::string& path) const;

    /// List immediate children of a group.
    std::vector<std::string> list(const std::string& path) const;

    /// Read attributes of a group or array.
    nlohmann::json read_attributes(const std::string& path) const;

    /// Get the root filesystem path.
    std::filesystem::path root_path() const;

private:
    std::filesystem::path root_;
    // ... internal helpers
};

} // namespace nxr::io
```

### 3.2 WriteOptions

```cpp
namespace nxr::io {

struct BloscOptions {
    std::string cname = "zstd";    // compressor: "zstd", "lz4", "lz4hc", "blosclz"
    int clevel = 5;                // compression level: 0-9
    std::string shuffle = "shuffle"; // "noshuffle", "shuffle", "bitshuffle"
};

struct WriteOptions {
    /// Chunk shape. If empty, defaults are chosen:
    /// - 1D arrays: single chunk (entire array)
    /// - 2D arrays: [dim0, min(dim1, 4096)]
    /// - nD arrays: implementation chooses reasonable defaults
    std::vector<int64_t> chunks = {};

    /// Compression options
    BloscOptions blosc = {};

    /// Arbitrary JSON attributes attached to the array
    nlohmann::json attrs = {};
};

} // namespace nxr::io
```

### 3.3 ArrayMetadata

```cpp
namespace nxr::io {

struct ArrayMetadata {
    std::vector<int64_t> shape;
    std::vector<int64_t> chunk_shape;
    std::string dtype;          // "float32", "float64", "int32", etc.
    int64_t typesize;           // bytes per element
    nlohmann::json attributes;
    nlohmann::json codecs;      // full codec pipeline from zarr.json
};

} // namespace nxr::io
```

---

## 4. Path Convention

All paths in the API use forward-slash notation starting with `/`:
- `"/manifold/vertices"` → `<store_root>/manifold/vertices/zarr.json`
- `"/"` → `<store_root>/zarr.json` (root group)

The implementation strips leading slashes and joins with the filesystem root. Paths must not contain `..` or absolute filesystem paths.

---

## 5. Implementation Details

### 5.1 Writing a Chunk

The core operation. Given a sub-array of typed data:

1. Ensure the chunk directory exists (`std::filesystem::create_directories`)
2. Apply the bytes codec: on little-endian systems (which is all modern systems), this is a no-op — the data is already in the correct byte order
3. Apply blosc2 compression:
   ```cpp
   std::vector<uint8_t> compressed(nbytes + BLOSC2_MAX_OVERHEAD);
   int csize = blosc2_compress(
       clevel, doshuffle, typesize,
       data_ptr, nbytes,
       compressed.data(), compressed.size()
   );
   ```
4. Write the compressed bytes to the chunk file (binary mode)

### 5.2 Writing an Array

Given a pointer to contiguous C-order data and a shape:

1. Create the array directory and `c/` subdirectory
2. Compute the chunk grid dimensions: `n_chunks[d] = ceil(shape[d] / chunk_shape[d])` for each dimension
3. Build the `zarr.json` metadata and write it
4. Iterate over all chunk grid positions. For each chunk:
   a. Compute the actual extent (handle edge chunks where the array doesn't evenly divide)
   b. Extract the sub-array into a contiguous buffer (this requires strided copy for nD arrays)
   c. Call the chunk writer

### 5.3 Extracting a Sub-Array for a Chunk (Critical Detail)

For a 2D array with shape `[D0, D1]` and chunk shape `[C0, C1]`, chunk at grid position `[ci, cj]`:

```cpp
int64_t row_start = ci * chunk_shape[0];
int64_t col_start = cj * chunk_shape[1];
int64_t row_end = std::min(row_start + chunk_shape[0], shape[0]);
int64_t col_end = std::min(col_start + chunk_shape[1], shape[1]);
int64_t rows = row_end - row_start;
int64_t cols = col_end - col_start;

std::vector<T> chunk_data(rows * cols);
for (int64_t r = 0; r < rows; ++r) {
    std::memcpy(
        chunk_data.data() + r * cols,
        source_data + (row_start + r) * shape[1] + col_start,
        cols * sizeof(T)
    );
}
```

For arrays where `chunk_shape[d] == shape[d]` for all but one dimension (which is the common case for time series chunking), the extraction simplifies to a single contiguous memcpy per chunk.

### 5.4 Eigen Column-Major Handling

Eigen stores matrices in column-major order by default. Zarr stores data in C-order (row-major). The `write_matrix` function must handle this:

```cpp
// Option 1: Create a row-major copy
Eigen::Matrix<Scalar, Eigen::Dynamic, Eigen::Dynamic, Eigen::RowMajor> row_major = mat;
// row_major.data() is now C-order contiguous

// Option 2: Transpose the shape
// If the user says "write a [N, 3] matrix" but Eigen stores it column-major,
// we write the data as-is but record shape as [3, N] — this is wrong.
// Always use Option 1.
```

**Rule: Always convert to row-major before writing.** The on-disk data must match the shape in `zarr.json`. zarrita.js and zarr-python expect C-order data.

### 5.5 Reading a Chunk

1. Read the chunk file (binary mode) into a byte buffer
2. Decompress with blosc2:
   ```cpp
   // Get decompressed size from blosc2 header
   int64_t nbytes;
   blosc2_cbuffer_sizes(compressed.data(), &nbytes, nullptr, nullptr);
   std::vector<uint8_t> decompressed(nbytes);
   blosc2_decompress(compressed.data(), compressed.size(),
                     decompressed.data(), nbytes);
   ```
3. Reinterpret the bytes as the target type

### 5.6 Reading an Array

1. Read `zarr.json`, parse metadata
2. Allocate output buffer of size `product(shape) * typesize`
3. Iterate over all chunk grid positions, read and decompress each chunk
4. Copy each decompressed chunk into the correct position in the output buffer (reverse of the extraction in 5.3)
5. For Eigen matrix output: copy from the C-order buffer into Eigen's column-major layout

### 5.7 blosc2 Initialization

blosc2 must be initialized before use and destroyed on cleanup:

```cpp
// In ZarrStore constructor or a static initializer:
blosc2_init();

// In ZarrStore destructor or atexit:
blosc2_destroy();
```

Use a static reference count or `std::call_once` to handle multiple ZarrStore instances.

---

## 6. File Structure

```
nxr-io/
├── CMakeLists.txt
├── README.md
├── include/
│   └── nxr/
│       └── io/
│           ├── zarr_store.h          # ZarrStore class declaration
│           ├── write_options.h       # WriteOptions, BloscOptions structs
│           ├── array_metadata.h      # ArrayMetadata struct
│           └── types.h               # dtype string ↔ C++ type mapping
├── src/
│   ├── zarr_store.cpp                # ZarrStore implementation
│   ├── zarr_writer.cpp               # chunk writing, array writing logic
│   ├── zarr_reader.cpp               # chunk reading, array reading logic
│   ├── metadata.cpp                  # zarr.json generation and parsing
│   ├── compression.cpp               # blosc2 wrapper (compress/decompress)
│   └── dtype_map.cpp                 # dtype string ↔ typesize mapping
├── extern/
│   ├── json/                         # nlohmann/json (header-only, vendored)
│   └── blosc2/                       # c-blosc2 (built via CMake)
└── tests/
    ├── test_write_read_roundtrip.cpp  # write array, read it back, verify
    ├── test_chunking.cpp             # edge chunks, various chunk shapes
    ├── test_eigen_interop.cpp        # Eigen matrix/vector read/write
    ├── test_sparse.cpp               # sparse matrix COO roundtrip
    ├── test_groups.cpp               # group creation, nesting, attributes
    ├── test_metadata.cpp             # zarr.json parsing and generation
    └── test_zarrita_compat.cpp       # write with nxr-io, read with zarr-python
```

---

## 7. CMake Build

```cmake
cmake_minimum_required(VERSION 3.20)
project(nxr-io VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# --- Dependencies ---

# nlohmann/json (header-only)
include(FetchContent)
FetchContent_Declare(json
    GIT_REPOSITORY https://github.com/nlohmann/json.git
    GIT_TAG v3.11.3
)
FetchContent_MakeAvailable(json)

# c-blosc2
FetchContent_Declare(blosc2
    GIT_REPOSITORY https://github.com/Blosc/c-blosc2.git
    GIT_TAG v2.15.1
)
set(BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(BUILD_BENCHMARKS OFF CACHE BOOL "" FORCE)
set(BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(blosc2)

# Eigen (header-only)
find_package(Eigen3 3.4 REQUIRED)

# --- Library ---
add_library(nxr-io
    src/zarr_store.cpp
    src/zarr_writer.cpp
    src/zarr_reader.cpp
    src/metadata.cpp
    src/compression.cpp
    src/dtype_map.cpp
)

target_include_directories(nxr-io
    PUBLIC
        $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
        $<INSTALL_INTERFACE:include>
)

target_link_libraries(nxr-io
    PUBLIC
        Eigen3::Eigen
    PRIVATE
        nlohmann_json::nlohmann_json
        blosc2_static
)

# --- Tests ---
option(NXR_IO_BUILD_TESTS "Build nxr-io tests" OFF)
if(NXR_IO_BUILD_TESTS)
    enable_testing()
    FetchContent_Declare(googletest
        GIT_REPOSITORY https://github.com/google/googletest.git
        GIT_TAG v1.14.0
    )
    FetchContent_MakeAvailable(googletest)

    add_executable(nxr-io-tests
        tests/test_write_read_roundtrip.cpp
        tests/test_chunking.cpp
        tests/test_eigen_interop.cpp
        tests/test_sparse.cpp
        tests/test_groups.cpp
        tests/test_metadata.cpp
    )
    target_link_libraries(nxr-io-tests PRIVATE nxr-io gtest_main)
    add_test(NAME nxr-io-tests COMMAND nxr-io-tests)
endif()

# --- Install ---
install(TARGETS nxr-io EXPORT nxr-io-targets)
install(DIRECTORY include/ DESTINATION include)
install(EXPORT nxr-io-targets
    FILE nxr-io-config.cmake
    NAMESPACE nxr::
    DESTINATION lib/cmake/nxr-io
)
```

---

## 8. Testing Strategy

### 8.1 Roundtrip Tests

Write an array with known values, read it back, verify element-by-element equality.

```cpp
TEST(Roundtrip, Float64Matrix) {
    auto tmp = std::filesystem::temp_directory_path() / "test_roundtrip.zarr";
    nxr::io::ZarrStore store(tmp);

    Eigen::MatrixXd mat(100, 50);
    mat.setRandom();
    store.write_matrix("/test/data", mat, {.chunks = {100, 25}});

    auto result = store.read_matrix("/test/data");
    EXPECT_EQ(result.rows(), 100);
    EXPECT_EQ(result.cols(), 50);
    EXPECT_TRUE(result.isApprox(mat));

    std::filesystem::remove_all(tmp);
}
```

### 8.2 Edge Chunk Tests

Verify correct handling when shape is not divisible by chunk shape.

```cpp
TEST(EdgeChunks, NonDivisible) {
    // shape [10, 7], chunk [10, 3] → chunks are [10,3], [10,3], [10,1]
    // The last chunk has only 1 column, not 3
}
```

### 8.3 zarrita.js / zarr-python Compatibility Test

**This is the most important test.** Write a store with nxr-io, then read it with zarr-python in a subprocess:

```cpp
TEST(Compatibility, ZarrPython) {
    // 1. Write test array with nxr-io
    // 2. Run: python3 -c "import zarr; a = zarr.open('test.zarr/data')[:]; print(a.tolist())"
    // 3. Parse the Python output
    // 4. Compare with original data
}
```

If the zarr-python reader can open and correctly read arrays written by nxr-io, the format is correct. zarrita.js uses the same spec, so browser compatibility follows.

---

## 9. Downstream Usage Pattern

This is how nxr-neuro (or any consumer) will use nxr-io. **Do not implement this in nxr-io** — this is provided for context only.

```cpp
#include <nxr/io/zarr_store.h>

// In nxr-neuro ingestion code:
void ingest_subject(const std::string& zarr_path,
                    /* mne-cpp data structures */) {

    nxr::io::ZarrStore store(zarr_path);

    // Root group with study metadata
    store.write_group("/", {
        {"nxr_version", "0.1.0"},
        {"subject", "sub-01"}
    });

    // Manifold (cortical surface geometry)
    store.write_group("/manifold");
    store.write_matrix("/manifold/vertices", vertices_matrix);   // [V, 3]
    store.write_matrix("/manifold/faces", faces_matrix);          // [F, 3]
    store.write_matrix("/manifold/normals", normals_matrix);      // [V, 3]
    store.write_array("/manifold/curvature", curv_vector);        // [V]

    // Recordings (MEG time series)
    store.write_group("/recordings/meg", {
        {"sfreq", 1000.0},
        {"ch_names", channel_names_json},
        {"ch_types", channel_types_json}
    });
    store.write_matrix("/recordings/meg/data", meg_matrix,        // [C, T]
        {.chunks = {n_channels, 4000}});                           // 4-sec chunks

    // Mapping (forward solution)
    store.write_group("/mapping/forward", {
        {"source_space_type", "surface"},
        {"n_sources", n_sources}
    });
    store.write_matrix("/mapping/forward/leadfield", leadfield);  // [S, N*3]
}
```

---

## 10. Zarr Schema for nxr Stores

**This section is reference for nxr-io consumers, not for nxr-io itself.**

A valid `.nxr.zarr` store follows this schema. The three top-level groups correspond to the three components of the MEG/EEG forward problem.

```
subject.nxr.zarr/
│
├── manifold/                          # Cortical surface geometry
│   ├── vertices          float64  [V, 3]       vertex positions (metres)
│   ├── faces             int32    [F, 3]       triangle indices
│   ├── normals           float64  [V, 3]       per-vertex normals
│   ├── curvature         float32  [V]          per-vertex curvature
│   │
│   ├── operators/                              # DEC operators (populated by nxr-compute)
│   │   ├── laplacian/    (COO sparse group)    # cotangent Laplacian
│   │   ├── mass/         (COO sparse group)    # lumped mass matrix
│   │   ├── d0/           (COO sparse group)    # vertex→edge gradient
│   │   ├── d1/           (COO sparse group)    # edge→face curl
│   │   ├── hodge0        float64  [V]          # Hodge star 0-forms
│   │   ├── hodge1        float64  [E]          # Hodge star 1-forms
│   │   └── vertex_areas  float64  [V]          # dual cell areas
│   │
│   └── eigenmodes/                             # (populated by nxr-compute)
│       ├── lbo/
│       │   ├── eigenvalues    float64  [k]
│       │   └── eigenvectors   float64  [V, k]   chunked [V, 50]
│       └── connection/
│           ├── eigenvalues    float64  [k]
│           └── eigenvectors   float64  [2V, k]   chunked [2V, 50]
│
├── recordings/                        # Time series data
│   └── meg/
│       ├── data          float64  [C, T]       chunked [C, sfreq*4]
│       ├── events        int64    [N_events, 3]
│       └── zarr.json attrs: sfreq, ch_names, ch_types, units
│
├── mapping/                           # Sensor ↔ source relationships
│   └── forward/
│       ├── leadfield     float64  [S, N_sources, 3]  or [S, N_sources]
│       └── zarr.json attrs: source_space_type, n_sources, ico_order
│
├── spectral/                          # Doubly-spectral analysis (populated by nxr-compute)
│   ├── lambda_omega      complex128 [k, n_freqs]   chunked [50, n_freqs]
│   └── dispersion_mask   bool       [k, n_freqs]
│
└── results/                           # Analysis outputs
    └── session_001/
        ├── flow_vectors   float32  [T, E]
        ├── divergence     float32  [T, V]
        ├── curl           float32  [T, V]
        ├── helmholtz/
        │   ├── irrotational float32 [T, E]
        │   └── solenoidal   float32 [T, E]
        ├── spectral/
        │   ├── coefficients float32 [T, k]
        │   └── power        float32 [T, k]
        └── tracks/
            ├── source_tracks float32 [N, T_max, 4]
            └── track_events  (structured)
```

### Sparse Matrix Convention (COO format)

Sparse matrices are stored as a group with three arrays and metadata:

```
operator_name/
├── zarr.json          attrs: {"format": "coo", "shape": [rows, cols], "nnz": N}
├── row_indices        int64  [nnz]
├── col_indices        int64  [nnz]
└── values             float64 [nnz]
```

---

## 11. Implementation Priorities

Build in this order:

1. **Metadata generation** — `zarr.json` for groups and arrays
2. **Compression wrapper** — blosc2 compress/decompress functions
3. **Chunk writer** — compress and write a single chunk
4. **Array writer (raw pointer)** — the core `write_array<T>` from pointer + shape
5. **Eigen overloads** — `write_matrix`, `write_array` for Eigen types
6. **Group writer** — `write_group`
7. **Roundtrip test** — write and read back, verify
8. **Chunk reader** — read and decompress a single chunk
9. **Array reader** — read all chunks, assemble into output buffer
10. **Eigen reader** — `read_matrix` returning Eigen types
11. **Sparse matrix** — `write_sparse` and `read_sparse` using COO convention
12. **zarr-python compatibility test** — the definitive correctness check
13. **Store inspection** — `exists`, `is_group`, `is_array`, `list`, `read_attributes`

---

## 12. Error Handling

Use exceptions. Define a base exception class:

```cpp
namespace nxr::io {

class ZarrError : public std::runtime_error {
    using std::runtime_error::runtime_error;
};

class ZarrIOError : public ZarrError {      // filesystem errors
    using ZarrError::ZarrError;
};

class ZarrFormatError : public ZarrError {  // invalid metadata, wrong dtype, etc.
    using ZarrError::ZarrError;
};

class ZarrCompressionError : public ZarrError {  // blosc2 failures
    using ZarrError::ZarrError;
};

} // namespace nxr::io
```

---

## 13. Things NOT to Implement (Yet)

- **Sharding** (Zarr v3 shard codec) — add later when browser serving performance demands it
- **Cloud storage backends** (S3, GCS) — use TensorStore when this is needed
- **Async I/O** — not needed for local filesystem
- **Thread safety** — single-writer assumption for now
- **Zarr v2 compatibility** — v3 only
- **Custom codecs beyond blosc** — blosc2 with zstd covers all current needs
- **Complex number types** — store as interleaved real/imaginary float64 pairs for now