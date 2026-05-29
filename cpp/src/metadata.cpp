#include "metadata.h"

#include <cstring>

#include "nxr/io/codec_pipeline.h"

namespace nxr::io::detail {

using nlohmann::json;

static bool is_float_dtype(DType d) {
  return d == DType::Float32 || d == DType::Float64;
}

static json fill_value_json(DType d, double fv) {
  // Floats serialize as numbers (0.0); integer/bool dtypes as integers (0) to
  // match zarr-python / zarrita output.
  if (is_float_dtype(d)) return json(fv);
  return json(static_cast<std::int64_t>(fv));
}

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

nlohmann::json make_group_json(const nlohmann::json& attributes) {
  return json{
      {"zarr_format", 3},
      {"node_type", "group"},
      {"attributes", attributes.is_null() ? json::object() : attributes},
  };
}

ArrayMetadata parse_array_json(const nlohmann::json& j) {
  ArrayMetadata m;
  m.shape = j.at("shape").get<std::vector<std::int64_t>>();
  m.chunks = j.at("chunk_grid").at("configuration").at("chunk_shape").get<std::vector<std::int64_t>>();
  m.dtype = dtype_from_string(j.at("data_type").get<std::string>());
  if (j.contains("fill_value") && !j.at("fill_value").is_null()) {
    m.fill_value = j.at("fill_value").get<double>();
  }
  if (j.contains("codecs")) {
    m.codecs = CodecPipeline::from_json(j.at("codecs")).specs();
  } else {
    m.codecs = CodecPipeline::canonical(/*compress=*/false, 0).specs();  // lenient default
  }
  m.attributes = j.value("attributes", json::object());
  return m;
}

std::vector<std::uint8_t> fill_pattern(DType d, double fv) {
  const std::size_t n = dtype_size(d);
  std::vector<std::uint8_t> b(n, 0);
  if (fv == 0.0) return b;  // zero fill == all-zero bytes for every supported dtype
  switch (d) {
    case DType::Float32: { float v = static_cast<float>(fv);       std::memcpy(b.data(), &v, 4); break; }
    case DType::Float64: { double v = fv;                          std::memcpy(b.data(), &v, 8); break; }
    case DType::Int8:    { std::int8_t v = static_cast<std::int8_t>(fv);   std::memcpy(b.data(), &v, 1); break; }
    case DType::Int16:   { std::int16_t v = static_cast<std::int16_t>(fv); std::memcpy(b.data(), &v, 2); break; }
    case DType::Int32:   { std::int32_t v = static_cast<std::int32_t>(fv); std::memcpy(b.data(), &v, 4); break; }
    case DType::Int64:   { std::int64_t v = static_cast<std::int64_t>(fv); std::memcpy(b.data(), &v, 8); break; }
    case DType::UInt8:   case DType::Bool: { std::uint8_t v = static_cast<std::uint8_t>(fv);   std::memcpy(b.data(), &v, 1); break; }
    case DType::UInt16:  { std::uint16_t v = static_cast<std::uint16_t>(fv); std::memcpy(b.data(), &v, 2); break; }
    case DType::UInt32:  { std::uint32_t v = static_cast<std::uint32_t>(fv); std::memcpy(b.data(), &v, 4); break; }
    case DType::UInt64:  { std::uint64_t v = static_cast<std::uint64_t>(fv); std::memcpy(b.data(), &v, 8); break; }
  }
  return b;
}

}  // namespace nxr::io::detail
