#include "nxr/io/schema.h"

#include <fstream>

namespace fs = std::filesystem;

namespace nxr::io {

static nlohmann::json read_json_file(const fs::path& p) {
  std::ifstream f(p, std::ios::binary);
  if (!f) throw ZarrIOError("[nxr/io] cannot read schema file " + p.string());
  return nlohmann::json::parse(f);
}

SchemaRegistry::SchemaRegistry(const fs::path& schema_dir) : dir_(schema_dir) {
  const nlohmann::json reg = read_json_file(dir_ / "registry.json").at("registry");
  for (auto it = reg.begin(); it != reg.end(); ++it) {
    kinds_[it.key()] = read_json_file(dir_ / it.value().get<std::string>());
  }
}

std::vector<std::string> SchemaRegistry::kinds() const {
  std::vector<std::string> out;
  for (const auto& [k, _] : kinds_) out.push_back(k);
  return out;
}

ValidationResult SchemaRegistry::validate(const ZarrStore& store, const std::string& path) const {
  ValidationResult res;
  nlohmann::json attrs;
  try {
    attrs = store.read_attributes(path);
  } catch (const std::exception&) {
    res.issues.push_back({path, "no node, or attributes unreadable"});
    return res;
  }
  if (!attrs.contains("schema") || !attrs["schema"].is_string()) {
    res.issues.push_back({path, "missing string 'schema' attribute"});
    return res;
  }
  validate_as(store, path, attrs["schema"].get<std::string>(), res);
  return res;
}

static std::string join(const std::string& base, const std::string& child) {
  return base.empty() ? child : base + "/" + child;
}

void SchemaRegistry::validate_as(const ZarrStore& store, const std::string& path,
                                 const std::string& kind_id, ValidationResult& res) const {
  const auto it = kinds_.find(kind_id);
  if (it == kinds_.end()) {
    res.issues.push_back({path, "unknown schema kind \"" + kind_id + "\""});
    return;
  }
  const nlohmann::json& schema = it->second;
  const nlohmann::json node_attrs = store.read_attributes(path);

  // Attributes: required presence + const equality.
  if (schema.contains("attributes")) {
    for (auto a = schema["attributes"].begin(); a != schema["attributes"].end(); ++a) {
      const std::string& name = a.key();
      const nlohmann::json& spec = a.value();
      const bool required = spec.value("required", false);
      if (!node_attrs.contains(name)) {
        if (required) res.issues.push_back({path, "missing required attribute '" + name + "'"});
        continue;
      }
      if (spec.contains("const") && node_attrs[name] != spec["const"]) {
        res.issues.push_back({path, "attribute '" + name + "' must equal " + spec["const"].dump()});
      }
    }
  }

  // Dense arrays: presence (if required), dtype, rank.
  if (schema.contains("arrays")) {
    for (auto a = schema["arrays"].begin(); a != schema["arrays"].end(); ++a) {
      const std::string full = join(path, a.key());
      const nlohmann::json& spec = a.value();
      const bool required = spec.value("required", false);
      if (!store.is_array(full)) {
        if (required) res.issues.push_back({full, "missing required array"});
        continue;
      }
      const ArrayMetadata m = store.read_metadata(full);
      if (spec.contains("dtype")) {
        const std::string want = spec["dtype"].get<std::string>();
        if (dtype_to_string(m.dtype) != want) {
          res.issues.push_back({full, "dtype is \"" + std::string(dtype_to_string(m.dtype)) +
                                          "\", expected \"" + want + "\""});
        }
      }
      if (spec.contains("shape")) {
        bool rank_ok = (m.shape.size() == spec["shape"].size());
        if (spec.contains("shape_variants")) {
          rank_ok = false;
          for (const auto& v : spec["shape_variants"]) {
            if (m.shape.size() == v.size()) { rank_ok = true; break; }
          }
        }
        if (!rank_ok) res.issues.push_back({full, "unexpected rank " + std::to_string(m.shape.size())});
      }
    }
  }

  // Sparse CSC groups.
  if (schema.contains("sparse")) {
    for (auto s = schema["sparse"].begin(); s != schema["sparse"].end(); ++s) {
      const std::string full = join(path, s.key());
      const bool required = s.value().value("required", false);
      if (!store.is_group(full)) {
        if (required) res.issues.push_back({full, "missing required sparse group"});
        continue;
      }
      const nlohmann::json sa = store.read_attributes(full);
      if (sa.value("format", std::string()) != "csc") {
        res.issues.push_back({full, "sparse 'format' must be \"csc\""});
      }
      for (const char* sub : {"indptr", "indices", "data"}) {
        if (!store.is_array(join(full, sub))) {
          res.issues.push_back({full, std::string("missing CSC sub-array '") + sub + "'"});
        }
      }
    }
  }

  // Subject components: each must exist and validate against its declared kind.
  if (schema.contains("components")) {
    for (auto c = schema["components"].begin(); c != schema["components"].end(); ++c) {
      const std::string full = join(path, c.key());
      const nlohmann::json& spec = c.value();
      const bool required = spec.value("required", false);
      if (!store.is_group(full)) {
        if (required) res.issues.push_back({full, "missing required component '" + c.key() + "'"});
        continue;
      }
      validate_as(store, full, spec.value("kind", std::string()), res);
    }
  }
}

}  // namespace nxr::io
