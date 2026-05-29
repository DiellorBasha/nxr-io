// nxr-io — zstd codec (Zarr v3 `zstd` codec body). These are the raw compress/
// decompress primitives; codec chaining and the `bytes` (endian) stage live in
// CodecPipeline (codec_pipeline.h), which calls these for any `zstd` stage.
#pragma once
#include <cstddef>
#include <cstdint>
#include <vector>

namespace nxr::io {

// Compress raw bytes into a single zstd frame. `level` follows the Zarr config
// (0 = zstd's default level). The frame embeds the content size.
std::vector<uint8_t> zstd_compress(const uint8_t* data, std::size_t nbytes, int level = 0);

// Decompress a zstd frame. If `expected_size` is 0 the size is read from the
// frame header; otherwise the caller-known size (shape * typesize) is used.
std::vector<uint8_t> zstd_decompress(const uint8_t* data, std::size_t nbytes,
                                     std::size_t expected_size = 0);

}  // namespace nxr::io
