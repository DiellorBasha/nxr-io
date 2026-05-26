#include "nxr/io/zarr_store.h"
#include "check.h"

#include <algorithm>
#include <cstdint>
#include <filesystem>
#include <string>
#include <vector>

namespace fs = std::filesystem;
using namespace nxr::io;

int main() {
  fs::path tmp = fs::temp_directory_path() / "nxr_io_crud.zarr";
  fs::remove_all(tmp);
  ZarrStore store(tmp);

  // list() — immediate child nodes (groups + arrays), sorted, excludes chunk dirs.
  store.write_group("g");
  store.write_array<double>("g/a", std::vector<double>{1, 2, 3}, {3});
  store.write_group("g/sub");
  auto kids = store.list("g");
  std::sort(kids.begin(), kids.end());
  CHECK_EQ(kids.size(), static_cast<std::size_t>(2));
  CHECK(kids == std::vector<std::string>({"a", "sub"}));

  // update_attributes() — shallow merge.
  store.write_group("m", {{"schema", "x"}, {"nV", 10}});
  store.update_attributes("m", {{"nV", 20}, {"k", 5}});
  auto a = store.read_attributes("m");
  CHECK(a.value("schema", std::string()) == "x");  // preserved
  CHECK(a.value("nV", 0) == 20);                    // overwritten
  CHECK(a.value("k", 0) == 5);                      // added

  // delete_attribute()
  store.delete_attribute("m", "k");
  CHECK(!store.read_attributes("m").contains("k"));

  // Overwrite an array with a SMALLER shape: stale chunk files must be cleared.
  WriteOptions o;
  o.chunks = {2};
  store.write_array<std::int32_t>("ov", std::vector<std::int32_t>{1, 2, 3, 4, 5, 6}, {6}, o);
  CHECK(fs::exists(tmp / "ov" / "c" / "2"));  // 3 chunks initially
  store.write_array<std::int32_t>("ov", std::vector<std::int32_t>{9, 8}, {2}, o);
  auto ov = store.read_array<std::int32_t>("ov");
  CHECK(ov == std::vector<std::int32_t>({9, 8}));
  CHECK(!fs::exists(tmp / "ov" / "c" / "1"));  // stale chunk gone
  CHECK(!fs::exists(tmp / "ov" / "c" / "2"));

  // delete_node()
  store.delete_node("g/a");
  CHECK(!store.exists("g/a"));
  CHECK(store.exists("g"));  // parent intact
  store.delete_node("g");
  CHECK(!store.exists("g"));

  // delete_node refuses to delete the root.
  bool refused = false;
  try { store.delete_node(""); } catch (const ZarrError&) { refused = true; }
  CHECK(refused);
  CHECK(store.is_group(""));  // root still there

  return nxrtest::finish("crud");
}
