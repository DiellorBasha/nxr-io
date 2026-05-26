#include "nxr/io/zarr_store.h"
#include "check.h"

#include <cstdint>
#include <filesystem>
#include <vector>

namespace fs = std::filesystem;
using namespace nxr::io;

int main() {
  fs::path tmp = fs::temp_directory_path() / "nxr_io_array_io.zarr";
  fs::remove_all(tmp);
  ZarrStore store(tmp);

  // 1D float64, single whole-array chunk, compressed.
  std::vector<double> a(100);
  for (std::size_t i = 0; i < a.size(); ++i) a[i] = static_cast<double>(i) * 0.5;
  store.write_array<double>("vec", a, {100});
  auto a2 = store.read_array<double>("vec");
  CHECK_EQ(a2.size(), a.size());
  CHECK(a2 == a);

  // 2D float64 with EDGE chunks: shape [10,7], chunk [10,3] -> axis1 chunks 3,3,1.
  std::vector<double> m(70);
  for (int i = 0; i < 70; ++i) m[i] = static_cast<double>(i);
  WriteOptions o;
  o.chunks = {10, 3};
  store.write_array<double>("mat", m, {10, 7}, o);
  auto m2 = store.read_array<double>("mat");
  CHECK_EQ(m2.size(), static_cast<std::size_t>(70));
  CHECK(m2 == m);

  auto meta = store.read_metadata("mat");
  CHECK(meta.shape == std::vector<std::int64_t>({10, 7}));
  CHECK(meta.chunks == std::vector<std::int64_t>({10, 3}));
  CHECK_EQ(dtype_size(meta.dtype), static_cast<std::size_t>(8));

  // Uncompressed edge chunks: the LAST chunk file must be full chunk_shape
  // (10*3*8 = 240 bytes), proving fill_value padding (not trimming).
  WriteOptions u;
  u.chunks = {10, 3};
  u.compress = false;
  store.write_array<double>("matu", m, {10, 7}, u);
  auto mu = store.read_array<double>("matu");
  CHECK(mu == m);
  fs::path last_chunk = tmp / "matu" / "c" / "0" / "2";
  CHECK(fs::exists(last_chunk));
  if (fs::exists(last_chunk)) {
    CHECK_EQ(static_cast<std::size_t>(fs::file_size(last_chunk)),
             static_cast<std::size_t>(10 * 3 * 8));
  }

  // int32 round-trip (negative values).
  std::vector<std::int32_t> iv(50);
  for (int i = 0; i < 50; ++i) iv[i] = i - 25;
  store.write_array<std::int32_t>("iv", iv, {50});
  auto iv2 = store.read_array<std::int32_t>("iv");
  CHECK(iv2 == iv);

  return nxrtest::finish("array_io");
}
