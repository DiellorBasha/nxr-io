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

  // Empty input encodes/decodes to empty for both pipelines.
  const CodecPipeline zp = CodecPipeline::canonical(/*compress=*/true, 0);
  CHECK(zp.encode(nullptr, 0).empty());
  CHECK(zp.decode(nullptr, 0, 0).empty());
  const CodecPipeline bp = CodecPipeline::canonical(/*compress=*/false, 0);
  CHECK(bp.encode(nullptr, 0).empty());
  CHECK(bp.decode(nullptr, 0, 0).empty());

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

  return nxrtest::finish("codec_pipeline");
}
