// nxr-io — ZarrStore: CRUD over a Zarr v3 store on the filesystem.
#pragma once
#include <cstdint>
#include <cstring>
#include <filesystem>
#include <string>
#include <vector>
#include <nlohmann/json.hpp>

#include "nxr/io/types.h"
#include "nxr/io/errors.h"
#include "nxr/io/array_metadata.h"
#include "nxr/io/write_options.h"

namespace nxr::io {

class ZarrStore {
 public:
  // Open or create a store rooted at `root`. Creates the root directory and a
  // root group zarr.json if absent.
  explicit ZarrStore(const std::filesystem::path& root);

  const std::filesystem::path& root_path() const { return root_; }

  // --- groups / inspection ---
  void write_group(const std::string& path,
                   const nlohmann::json& attributes = nlohmann::json::object());
  bool exists(const std::string& path) const;
  bool is_group(const std::string& path) const;
  bool is_array(const std::string& path) const;
  nlohmann::json read_attributes(const std::string& path) const;

  // --- arrays ---
  ArrayMetadata read_metadata(const std::string& path) const;

  template <class T>
  void write_array(const std::string& path, const T* data,
                   const std::vector<std::int64_t>& shape,
                   const WriteOptions& opts = {}) {
    write_raw(path, reinterpret_cast<const std::uint8_t*>(data), dtype_of<T>(), shape, opts);
  }

  template <class T>
  void write_array(const std::string& path, const std::vector<T>& data,
                   const std::vector<std::int64_t>& shape,
                   const WriteOptions& opts = {}) {
    write_array<T>(path, data.data(), shape, opts);
  }

  template <class T>
  std::vector<T> read_array(const std::string& path) const {
    ArrayMetadata meta;
    std::vector<std::uint8_t> bytes = read_raw(path, meta);
    if (dtype_size(meta.dtype) != sizeof(T)) {
      throw ZarrFormatError("[nxr/io] read_array<T> element size mismatch at \"" + path +
                            "\" (on-disk dtype \"" + dtype_to_string(meta.dtype) + "\")");
    }
    std::vector<T> out(bytes.size() / sizeof(T));
    if (!bytes.empty()) std::memcpy(out.data(), bytes.data(), bytes.size());
    return out;
  }

 private:
  void write_raw(const std::string& path, const std::uint8_t* data, DType dtype,
                 const std::vector<std::int64_t>& shape, const WriteOptions& opts);
  std::vector<std::uint8_t> read_raw(const std::string& path, ArrayMetadata& out_meta) const;
  std::filesystem::path resolve(const std::string& path) const;

  std::filesystem::path root_;
};

}  // namespace nxr::io
