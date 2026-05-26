// nxr-io — schema validation. Loads the machine-readable kind schemas
// (schema/registry.json + nxr.*.schema.json) and structurally validates a store:
// required attributes (incl. const `schema`), required arrays (dtype + rank),
// CSC sparse groups, and subject components. Pragmatic structural checks — not a
// full JSON-Schema engine.
#pragma once
#include <filesystem>
#include <map>
#include <string>
#include <vector>
#include <nlohmann/json.hpp>

#include "nxr/io/zarr_store.h"

namespace nxr::io {

struct ValidationIssue {
  std::string path;     // node path the issue concerns
  std::string message;  // human-readable description
};

struct ValidationResult {
  std::vector<ValidationIssue> issues;
  bool ok() const { return issues.empty(); }
};

class SchemaRegistry {
 public:
  // Load registry.json + every referenced kind schema from `schema_dir`.
  explicit SchemaRegistry(const std::filesystem::path& schema_dir);

  // Validate the node at `path` against the kind named by its `schema` attribute.
  ValidationResult validate(const ZarrStore& store, const std::string& path = "") const;

  // Known kind ids, e.g. "nxr.manifold@1.0".
  std::vector<std::string> kinds() const;

 private:
  void validate_as(const ZarrStore& store, const std::string& path,
                   const std::string& kind_id, ValidationResult& res) const;

  std::filesystem::path dir_;
  std::map<std::string, nlohmann::json> kinds_;  // kind@version -> schema json
};

}  // namespace nxr::io
