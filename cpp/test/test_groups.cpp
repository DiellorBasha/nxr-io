#include "nxr/io/zarr_store.h"
#include "check.h"

#include <filesystem>
#include <string>
#include <vector>

namespace fs = std::filesystem;
using namespace nxr::io;

int main() {
  fs::path tmp = fs::temp_directory_path() / "nxr_io_groups.zarr";
  fs::remove_all(tmp);
  ZarrStore store(tmp);

  // The constructor establishes a root group.
  CHECK(store.is_group(""));
  CHECK(!store.is_array(""));

  // Create a group with attributes.
  store.write_group("manifold", {{"schema", "nxr.manifold@1.0"}, {"nV", 100}});
  CHECK(store.exists("manifold"));
  CHECK(store.is_group("manifold"));
  CHECK(!store.is_array("manifold"));
  auto a = store.read_attributes("manifold");
  CHECK(a.value("schema", std::string()) == "nxr.manifold@1.0");
  CHECK(a.value("nV", 0) == 100);

  // Nested group (intermediate dirs auto-created).
  store.write_group("manifold/eigenmodes/scalar", {{"K", 50}});
  CHECK(store.is_group("manifold/eigenmodes/scalar"));
  CHECK(store.read_attributes("manifold/eigenmodes/scalar").value("K", 0) == 50);

  // Arrays are arrays, not groups; attributes round-trip through WriteOptions.
  std::vector<double> v(10, 1.0);
  WriteOptions o;
  o.attributes = {{"units", "1/mm"}};
  store.write_array<double>("manifold/curvature", v, {10}, o);
  CHECK(store.is_array("manifold/curvature"));
  CHECK(!store.is_group("manifold/curvature"));
  CHECK(store.exists("manifold/curvature"));
  CHECK(store.read_attributes("manifold/curvature").value("units", std::string()) == "1/mm");

  // Absent node.
  CHECK(!store.exists("nope"));

  return nxrtest::finish("groups");
}
