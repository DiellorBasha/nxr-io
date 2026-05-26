// nxr-io — internal zarr.json generation / parsing.
#pragma once
#include <cstdint>
#include <vector>
#include <nlohmann/json.hpp>
#include "nxr/io/types.h"
#include "nxr/io/array_metadata.h"

namespace nxr::io::detail {

// Build an array `zarr.json` object with the canonical codec pipeline
// ([bytes(le), zstd] when compress, else [bytes(le)]).
nlohmann::json make_array_json(DType dtype, const std::vector<std::int64_t>& shape,
                               const std::vector<std::int64_t>& chunks, double fill_value,
                               bool compress, int zstd_level,
                               const nlohmann::json& attributes);

// Build a group `zarr.json` object.
nlohmann::json make_group_json(const nlohmann::json& attributes);

// Parse an array `zarr.json` object into ArrayMetadata.
ArrayMetadata parse_array_json(const nlohmann::json& j);

// itemsize little-endian byte pattern for a fill value (used to pad edge cells).
std::vector<std::uint8_t> fill_pattern(DType d, double fill_value);

}  // namespace nxr::io::detail
