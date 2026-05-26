#include "nxr/io/zarr_store.h"
#include "nxr/io/schema.h"
#include "check.h"

#include <cstdint>
#include <filesystem>
#include <string>
#include <vector>

namespace fs = std::filesystem;
using namespace nxr::io;

// Build a minimal standalone manifold store (root schema = nxr.manifold@1.0).
static ZarrStore make_manifold(const fs::path& p, bool with_faces, bool vertices_f32) {
  fs::remove_all(p);
  ZarrStore s(p);
  s.update_attributes("", {{"schema", "nxr.manifold@1.0"}, {"nV", 4}, {"nF", 2}});
  if (vertices_f32) {
    std::vector<float> v(4 * 3, 0.0f);
    s.write_array<float>("mesh/vertices", v, {4, 3});
  } else {
    std::vector<double> v(4 * 3, 0.0);
    s.write_array<double>("mesh/vertices", v, {4, 3});
  }
  if (with_faces) {
    std::vector<std::int32_t> f(2 * 3, 0);
    s.write_array<std::int32_t>("mesh/faces", f, {2, 3});
  }
  return s;
}

static bool mentions(const ValidationResult& r, const std::string& needle) {
  for (const auto& i : r.issues) {
    if (i.path.find(needle) != std::string::npos || i.message.find(needle) != std::string::npos)
      return true;
  }
  return false;
}

int main() {
  SchemaRegistry reg{fs::path(NXR_IO_SCHEMA_DIR)};
  CHECK(!reg.kinds().empty());

  const fs::path base = fs::temp_directory_path();

  // Valid manifold.
  auto good = make_manifold(base / "nxr_schema_ok.zarr", true, false);
  auto r = reg.validate(good);
  CHECK(r.ok());

  // Missing required array mesh/faces.
  auto nofaces = make_manifold(base / "nxr_schema_nofaces.zarr", false, false);
  auto r2 = reg.validate(nofaces);
  CHECK(!r2.ok());
  CHECK(mentions(r2, "faces"));

  // Wrong dtype: vertices float32 (schema requires float64).
  auto wrongdt = make_manifold(base / "nxr_schema_wrongdt.zarr", true, true);
  auto r3 = reg.validate(wrongdt);
  CHECK(!r3.ok());
  CHECK(mentions(r3, "vertices"));

  // Unknown schema version.
  fs::remove_all(base / "nxr_schema_badver.zarr");
  ZarrStore bad(base / "nxr_schema_badver.zarr");
  bad.update_attributes("", {{"schema", "nxr.manifold@9.9"}});
  auto r4 = reg.validate(bad);
  CHECK(!r4.ok());

  // Missing schema attribute entirely.
  fs::remove_all(base / "nxr_schema_noattr.zarr");
  ZarrStore noattr(base / "nxr_schema_noattr.zarr");
  auto r5 = reg.validate(noattr);
  CHECK(!r5.ok());

  return nxrtest::finish("schema");
}
