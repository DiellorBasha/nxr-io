// nxr-io — array metadata (parsed from zarr.json).
#pragma once
#include <cstdint>
#include <vector>
#include <nlohmann/json.hpp>
#include "nxr/io/types.h"

namespace nxr::io {

struct ArrayMetadata {
  std::vector<std::int64_t> shape;
  std::vector<std::int64_t> chunks;
  DType dtype = DType::Float64;
  double fill_value = 0.0;
  bool compressed = true;  // zstd present in the codec pipeline
  nlohmann::json attributes = nlohmann::json::object();
};

}  // namespace nxr::io
