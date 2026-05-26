#include "nxr/io/codec.h"
#include "check.h"
#include <cstdint>
#include <vector>

using namespace nxr::io;

int main() {
  // Compressible payload (repeating pattern).
  std::vector<uint8_t> orig(8000);
  for (std::size_t i = 0; i < orig.size(); ++i) orig[i] = static_cast<uint8_t>(i % 7);

  auto comp = zstd_compress(orig.data(), orig.size(), 0);
  CHECK(comp.size() > 0);
  CHECK(comp.size() < orig.size());  // pattern must actually compress

  // Decompress with size read from the frame header.
  auto back = zstd_decompress(comp.data(), comp.size());
  CHECK_EQ(back.size(), orig.size());
  CHECK(back == orig);

  // Decompress with a caller-supplied expected size (the array-reader path).
  auto back2 = zstd_decompress(comp.data(), comp.size(), orig.size());
  CHECK(back2 == orig);

  // Empty input round-trips to empty.
  auto compEmpty = zstd_compress(nullptr, 0, 0);
  auto backEmpty = zstd_decompress(compEmpty.data(), compEmpty.size(), 0);
  CHECK_EQ(backEmpty.size(), static_cast<std::size_t>(0));

  return nxrtest::finish("codec");
}
