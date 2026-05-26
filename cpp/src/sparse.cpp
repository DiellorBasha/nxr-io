#include "nxr/io/zarr_store.h"

namespace nxr::io {

void ZarrStore::write_sparse(const std::string& path, const CscMatrix& m,
                             const WriteOptions& opts) {
  if (static_cast<std::int64_t>(m.indptr.size()) != m.cols + 1) {
    throw ZarrFormatError("[nxr/io] CSC indptr length must be cols+1 for \"" + path + "\"");
  }
  if (m.indices.size() != m.data.size()) {
    throw ZarrFormatError("[nxr/io] CSC indices/data length mismatch for \"" + path + "\"");
  }

  nlohmann::json attrs = opts.attributes.is_object() ? opts.attributes : nlohmann::json::object();
  attrs["format"] = "csc";
  attrs["shape"] = nlohmann::json::array({m.rows, m.cols});
  attrs["nnz"] = m.nnz();
  write_group(path, attrs);

  WriteOptions sub;  // sub-arrays inherit compression, carry no attributes
  sub.compress = opts.compress;
  sub.zstd_level = opts.zstd_level;
  write_array<std::int32_t>(path + "/indptr", m.indptr,
                            {static_cast<std::int64_t>(m.indptr.size())}, sub);
  write_array<std::int32_t>(path + "/indices", m.indices, {m.nnz()}, sub);
  write_array<double>(path + "/data", m.data, {m.nnz()}, sub);
}

CscMatrix ZarrStore::read_sparse(const std::string& path) const {
  const nlohmann::json a = read_attributes(path);
  if (a.value("format", std::string()) != "csc") {
    throw ZarrFormatError("[nxr/io] \"" + path + "\" is not a CSC sparse group");
  }
  const auto shape = a.at("shape").get<std::vector<std::int64_t>>();
  if (shape.size() != 2) {
    throw ZarrFormatError("[nxr/io] CSC shape must be [rows, cols] for \"" + path + "\"");
  }

  CscMatrix m;
  m.rows = shape[0];
  m.cols = shape[1];
  m.indptr  = read_array<std::int32_t>(path + "/indptr");
  m.indices = read_array<std::int32_t>(path + "/indices");
  m.data    = read_array<double>(path + "/data");
  return m;
}

}  // namespace nxr::io
