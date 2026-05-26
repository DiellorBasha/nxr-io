#include "nxr/io/zarr_store.h"
#include "check.h"

#include <cstdint>
#include <filesystem>
#include <string>
#include <vector>

namespace fs = std::filesystem;
using namespace nxr::io;

int main() {
  fs::path tmp = fs::temp_directory_path() / "nxr_io_sparse.zarr";
  fs::remove_all(tmp);
  ZarrStore store(tmp);

  // 3x3 matrix [[10,0,0],[0,20,0],[5,0,30]] in CSC (column-major).
  CscMatrix m;
  m.rows = 3;
  m.cols = 3;
  m.indptr  = {0, 2, 3, 4};   // cols+1
  m.indices = {0, 2, 1, 2};   // row indices per column
  m.data    = {10, 5, 20, 30};

  WriteOptions wo;
  wo.attributes = {{"description", "cotan Laplacian"}};
  store.write_sparse("operators/stiffness", m, wo);

  // Group attributes.
  auto a = store.read_attributes("operators/stiffness");
  CHECK(a.value("format", std::string()) == "csc");
  CHECK(a.value("nnz", 0) == 4);
  CHECK(a.at("shape").get<std::vector<std::int64_t>>() == std::vector<std::int64_t>({3, 3}));
  CHECK(a.value("description", std::string()) == "cotan Laplacian");

  // Sub-arrays.
  CHECK(store.is_group("operators/stiffness"));
  CHECK(store.is_array("operators/stiffness/indptr"));
  CHECK(store.is_array("operators/stiffness/indices"));
  CHECK(store.is_array("operators/stiffness/data"));

  // Round-trip.
  auto r = store.read_sparse("operators/stiffness");
  CHECK(r.rows == 3);
  CHECK(r.cols == 3);
  CHECK(r.nnz() == 4);
  CHECK(r.indptr  == std::vector<std::int32_t>({0, 2, 3, 4}));
  CHECK(r.indices == std::vector<std::int32_t>({0, 2, 1, 2}));
  CHECK(r.data    == std::vector<double>({10, 5, 20, 30}));

  // Reading a non-CSC node as sparse throws.
  store.write_array<double>("dense", std::vector<double>{1, 2}, {2});
  bool threw = false;
  try { store.read_sparse("dense"); } catch (const ZarrError&) { threw = true; }
  CHECK(threw);

  return nxrtest::finish("sparse");
}
