// nxr-io — WebAssembly bindings (embind). The JS side stages a Zarr store into
// the Emscripten MEMFS (Module.FS.writeFile), then constructs ZarrStore on that
// path; the C++ engine reads it with ordinary std::filesystem I/O.
#include <cstdint>
#include <string>
#include <vector>

#include <emscripten/bind.h>
#include <emscripten/val.h>

#include "nxr/io/zarr_store.h"

using namespace emscripten;
using namespace nxr::io;

namespace {

// Copy a std::vector<T> into a freshly-allocated JS typed array (owns its buffer,
// independent of the C++ vector which is destroyed on return).
template <class T>
val copy_to_typed(const char* ctor, const std::vector<T>& v) {
  const val view = val(typed_memory_view(v.size(), v.data()));
  return val::global(ctor).new_(view);  // `new Ctor(view)` copies the bytes
}

class WasmStore {
 public:
  explicit WasmStore(const std::string& root) : store_(root) {}

  bool exists(const std::string& p) const { return store_.exists(p); }
  bool isArray(const std::string& p) const { return store_.is_array(p); }
  bool isGroup(const std::string& p) const { return store_.is_group(p); }

  std::string readAttributes(const std::string& p) const {
    return store_.read_attributes(p).dump();
  }

  std::string readMetadata(const std::string& p) const {
    const ArrayMetadata m = store_.read_metadata(p);
    nlohmann::json j;
    j["dtype"] = dtype_to_string(m.dtype);
    j["shape"] = m.shape;
    j["chunks"] = m.chunks;
    return j.dump();
  }

  // Returns { dtype: string, shape: number[], data: TypedArray }.
  val readArray(const std::string& p) const {
    const ArrayMetadata m = store_.read_metadata(p);
    val out = val::object();
    out.set("dtype", std::string(dtype_to_string(m.dtype)));
    val shape = val::array();
    for (std::size_t i = 0; i < m.shape.size(); ++i) shape.set(i, static_cast<double>(m.shape[i]));
    out.set("shape", shape);

    switch (m.dtype) {
      case DType::Float64: out.set("data", copy_to_typed("Float64Array", store_.read_array<double>(p))); break;
      case DType::Float32: out.set("data", copy_to_typed("Float32Array", store_.read_array<float>(p))); break;
      case DType::Int32:   out.set("data", copy_to_typed("Int32Array", store_.read_array<std::int32_t>(p))); break;
      case DType::UInt32:  out.set("data", copy_to_typed("Uint32Array", store_.read_array<std::uint32_t>(p))); break;
      case DType::Int16:   out.set("data", copy_to_typed("Int16Array", store_.read_array<std::int16_t>(p))); break;
      case DType::UInt16:  out.set("data", copy_to_typed("Uint16Array", store_.read_array<std::uint16_t>(p))); break;
      case DType::Int8:    out.set("data", copy_to_typed("Int8Array", store_.read_array<std::int8_t>(p))); break;
      case DType::UInt8:
      case DType::Bool:    out.set("data", copy_to_typed("Uint8Array", store_.read_array<std::uint8_t>(p))); break;
      default:
        throw ZarrFormatError("[nxr/io] WASM readArray: unsupported dtype \"" +
                              std::string(dtype_to_string(m.dtype)) + "\"");
    }
    return out;
  }

 private:
  ZarrStore store_;
};

}  // namespace

EMSCRIPTEN_BINDINGS(nxr_io) {
  class_<WasmStore>("ZarrStore")
      .constructor<std::string>()
      .function("exists", &WasmStore::exists)
      .function("isArray", &WasmStore::isArray)
      .function("isGroup", &WasmStore::isGroup)
      .function("readAttributes", &WasmStore::readAttributes)
      .function("readMetadata", &WasmStore::readMetadata)
      .function("readArray", &WasmStore::readArray);
}
