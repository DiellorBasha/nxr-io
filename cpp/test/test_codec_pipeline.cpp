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

  return nxrtest::finish("codec_pipeline");
}
