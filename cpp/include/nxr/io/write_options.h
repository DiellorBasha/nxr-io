// nxr-io — array write options.
#pragma once
#include <cstdint>
#include <vector>
#include <nlohmann/json.hpp>

namespace nxr::io {

struct WriteOptions {
  // Chunk shape. Empty => a single chunk covering the whole array.
  std::vector<std::int64_t> chunks;
  // true => codec pipeline [bytes(le), zstd]; false => [bytes(le)] only.
  bool compress = true;
  int zstd_level = 0;       // Zarr `zstd.level` (0 = zstd default)
  double fill_value = 0.0;  // value for unwritten / edge-pad elements
  nlohmann::json attributes = nlohmann::json::object();
};

}  // namespace nxr::io
