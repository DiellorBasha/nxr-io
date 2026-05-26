// Acceptance test: read the real gbf_benchmark.zarr fixture (zstd-compressed
// Zarr v3 produced by zarr-python) to prove cross-implementation read compat.
#include "nxr/io/zarr_store.h"
#include "check.h"

#include <cstdio>
#include <filesystem>
#include <string>
#include <vector>

namespace fs = std::filesystem;
using namespace nxr::io;

int main() {
  const fs::path data = fs::path(NXR_IO_DATA_DIR) / "gbf_benchmark.zarr";
  if (!fs::exists(data)) {
    std::printf("SKIP read_existing (no fixture at %s)\n", data.string().c_str());
    return 0;
  }
  ZarrStore store(data);  // does not overwrite the existing root zarr.json

  // Root attributes.
  auto root = store.read_attributes("");
  CHECK(root.value("schema", std::string()) == "nxr.gbf_bench@1.0");
  CHECK(root.value("n_sources", 0) == 20484);

  // forward_eeg/sol : [128, 20484] float64, chunk [16, 5121], zstd (32 chunks).
  CHECK(store.is_array("forward_eeg/sol"));
  auto meta = store.read_metadata("forward_eeg/sol");
  CHECK(meta.shape == std::vector<std::int64_t>({128, 20484}));
  CHECK(meta.chunks == std::vector<std::int64_t>({16, 5121}));
  CHECK_EQ(dtype_size(meta.dtype), static_cast<std::size_t>(8));
  CHECK(meta.compressed);

  auto sol = store.read_array<double>("forward_eeg/sol");
  CHECK_EQ(sol.size(), static_cast<std::size_t>(128) * 20484);
  bool any_nonzero = false;
  for (double x : sol) { if (x != 0.0) { any_nonzero = true; break; } }
  CHECK(any_nonzero);

  // int32 vertex indices.
  CHECK(store.is_array("src/lh/vertno"));
  auto vn = store.read_array<std::int32_t>("src/lh/vertno");
  CHECK_EQ(vn.size(), static_cast<std::size_t>(10242));

  // float32 source positions [20484, 3].
  auto rr = store.read_array<float>("forward_eeg/source_rr");
  CHECK_EQ(rr.size(), static_cast<std::size_t>(20484) * 3);

  // float64 patterns [200, 20484], chunk [25, 5121].
  auto pat = store.read_array<double>("sources/patterns");
  CHECK_EQ(pat.size(), static_cast<std::size_t>(200) * 20484);

  return nxrtest::finish("read_existing");
}
