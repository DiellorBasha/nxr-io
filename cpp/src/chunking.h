// nxr-io — internal chunk-grid geometry and region copy (C-order).
#pragma once
#include <cstddef>
#include <cstdint>
#include <vector>

namespace nxr::io::detail {

// Product of dimensions (1 for an empty/scalar shape).
std::int64_t product(const std::vector<std::int64_t>& dims);

// Chunks per dimension = ceil(shape[d] / chunks[d]).
std::vector<std::int64_t> chunk_grid(const std::vector<std::int64_t>& shape,
                                     const std::vector<std::int64_t>& chunks);

// Copy the in-bounds region of grid cell `g` between a full-array C-order buffer
// (sized prod(shape)) and a full chunk_shape C-order buffer (sized prod(chunks)).
// `array_to_chunk` true = extract (array -> chunk, for writing); false = scatter
// (chunk -> array, for reading). Padded edge cells touch only the in-bounds part.
void copy_chunk_region(const std::vector<std::int64_t>& shape,
                       const std::vector<std::int64_t>& chunks,
                       const std::vector<std::int64_t>& g, std::size_t itemsize,
                       std::uint8_t* array_buf, std::uint8_t* chunk_buf,
                       bool array_to_chunk);

}  // namespace nxr::io::detail
