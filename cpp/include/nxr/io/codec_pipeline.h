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
