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

CodecPipeline CodecPipeline::from_json(const nlohmann::json& codecs) {
  std::vector<CodecSpec> specs;
  for (const auto& c : codecs) {
    specs.push_back(CodecSpec{c.value("name", std::string()),
                              c.value("configuration", json::object())});
  }
  return CodecPipeline(std::move(specs));
}

void CodecPipeline::validate() const {
  if (specs_.empty()) {
    throw ZarrFormatError("[nxr/io] codec pipeline is empty");
  }
  if (specs_.front().name != "bytes") {
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
  if (nbytes == 0) return {};
  std::vector<std::uint8_t> buf(data, data + nbytes);  // `bytes` codec: identity on LE
  for (std::size_t i = 1; i < specs_.size(); ++i) {
    const int level = specs_[i].configuration.value("level", 0);
    buf = zstd_compress(buf.data(), buf.size(), level);
  }
  return buf;
}

std::vector<std::uint8_t> CodecPipeline::decode(const std::uint8_t* data, std::size_t nbytes,
                                                std::size_t raw_size) const {
  if (nbytes == 0) return {};
  std::vector<std::uint8_t> buf(data, data + nbytes);
  for (std::size_t k = specs_.size(); k > 1; --k) {
    const std::size_t i = k - 1;          // bytes->bytes codec index
    const std::size_t expected = (i == 1) ? raw_size : 0;  // i==1 yields raw bytes; 0 => read size from frame header
    buf = zstd_decompress(buf.data(), buf.size(), expected);
  }
  return buf;  // `bytes` codec (index 0): identity on LE
}

}  // namespace nxr::io
