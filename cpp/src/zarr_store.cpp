#include "nxr/io/zarr_store.h"

#include <algorithm>
#include <cstring>
#include <filesystem>
#include <fstream>

#include "nxr/io/codec.h"
#include "nxr/io/codec_pipeline.h"
#include "chunking.h"
#include "metadata.h"

namespace fs = std::filesystem;

namespace nxr::io {

// ─── file helpers ─────────────────────────────────────────────────────────
static void write_text(const fs::path& p, const std::string& s) {
  std::ofstream f(p, std::ios::binary | std::ios::trunc);
  if (!f) throw ZarrIOError("[nxr/io] cannot write " + p.string());
  f.write(s.data(), static_cast<std::streamsize>(s.size()));
}

static void write_bytes(const fs::path& p, const std::vector<std::uint8_t>& b) {
  std::ofstream f(p, std::ios::binary | std::ios::trunc);
  if (!f) throw ZarrIOError("[nxr/io] cannot write " + p.string());
  if (!b.empty()) f.write(reinterpret_cast<const char*>(b.data()),
                          static_cast<std::streamsize>(b.size()));
}

static std::vector<std::uint8_t> read_bytes(const fs::path& p) {
  std::ifstream f(p, std::ios::binary | std::ios::ate);
  if (!f) throw ZarrIOError("[nxr/io] cannot read " + p.string());
  const auto n = static_cast<std::size_t>(f.tellg());
  std::vector<std::uint8_t> b(n);
  f.seekg(0);
  if (n) f.read(reinterpret_cast<char*>(b.data()), static_cast<std::streamsize>(n));
  return b;
}

static nlohmann::json read_json(const fs::path& p) {
  std::ifstream f(p, std::ios::binary);
  if (!f) throw ZarrIOError("[nxr/io] cannot read " + p.string());
  return nlohmann::json::parse(f);
}

static fs::path chunk_path(const fs::path& dir, const std::vector<std::int64_t>& g) {
  fs::path p = dir / "c";
  for (std::int64_t gi : g) p /= std::to_string(gi);
  return p;
}

static std::string node_type_of(const fs::path& dir) {
  const fs::path j = dir / "zarr.json";
  if (!fs::exists(j)) return "";
  try {
    return read_json(j).value("node_type", std::string());
  } catch (...) {
    return "";
  }
}

// Advance C-order grid odometer (dim 0 most-significant). Returns false on wrap.
static bool advance(std::vector<std::int64_t>& g, const std::vector<std::int64_t>& grid) {
  if (g.empty()) return false;
  int d = static_cast<int>(g.size()) - 1;
  while (d >= 0) {
    if (++g[d] < grid[d]) return true;
    g[d] = 0;
    --d;
  }
  return false;
}

// ─── store ────────────────────────────────────────────────────────────────
ZarrStore::ZarrStore(const fs::path& root) : root_(root) {
  fs::create_directories(root_);
  const fs::path rj = root_ / "zarr.json";
  if (!fs::exists(rj)) {
    write_text(rj, detail::make_group_json(nlohmann::json::object()).dump());
  }
}

fs::path ZarrStore::resolve(const std::string& path) const {
  std::string p = path;
  while (!p.empty() && p.front() == '/') p.erase(p.begin());
  if (p.find("..") != std::string::npos) {
    throw ZarrIOError("[nxr/io] path must not contain '..': " + path);
  }
  return p.empty() ? root_ : root_ / p;
}

void ZarrStore::write_group(const std::string& path, const nlohmann::json& attributes) {
  const fs::path dir = resolve(path);
  fs::create_directories(dir);
  write_text(dir / "zarr.json", detail::make_group_json(attributes).dump());
}

bool ZarrStore::exists(const std::string& path) const {
  return fs::exists(resolve(path) / "zarr.json");
}

bool ZarrStore::is_group(const std::string& path) const {
  return node_type_of(resolve(path)) == "group";
}

bool ZarrStore::is_array(const std::string& path) const {
  return node_type_of(resolve(path)) == "array";
}

nlohmann::json ZarrStore::read_attributes(const std::string& path) const {
  const fs::path j = resolve(path) / "zarr.json";
  if (!fs::exists(j)) throw ZarrIOError("[nxr/io] no node at \"" + path + "\"");
  return read_json(j).value("attributes", nlohmann::json::object());
}

std::vector<std::string> ZarrStore::list(const std::string& path) const {
  std::vector<std::string> out;
  const fs::path dir = resolve(path);
  if (!fs::is_directory(dir)) return out;
  for (const auto& entry : fs::directory_iterator(dir)) {
    if (entry.is_directory() && fs::exists(entry.path() / "zarr.json")) {
      out.push_back(entry.path().filename().string());
    }
  }
  std::sort(out.begin(), out.end());
  return out;
}

void ZarrStore::update_attributes(const std::string& path, const nlohmann::json& patch) {
  const fs::path j = resolve(path) / "zarr.json";
  if (!fs::exists(j)) throw ZarrIOError("[nxr/io] no node at \"" + path + "\"");
  nlohmann::json meta = read_json(j);
  nlohmann::json attrs = meta.value("attributes", nlohmann::json::object());
  attrs.update(patch);  // shallow merge: keys overwrite or add
  meta["attributes"] = attrs;
  write_text(j, meta.dump());
}

void ZarrStore::delete_attribute(const std::string& path, const std::string& key) {
  const fs::path j = resolve(path) / "zarr.json";
  if (!fs::exists(j)) throw ZarrIOError("[nxr/io] no node at \"" + path + "\"");
  nlohmann::json meta = read_json(j);
  if (meta.contains("attributes")) meta["attributes"].erase(key);
  write_text(j, meta.dump());
}

void ZarrStore::delete_node(const std::string& path) {
  const fs::path dir = resolve(path);
  if (fs::weakly_canonical(dir) == fs::weakly_canonical(root_)) {
    throw ZarrIOError("[nxr/io] refusing to delete the store root");
  }
  fs::remove_all(dir);
}

ArrayMetadata ZarrStore::read_metadata(const std::string& path) const {
  const fs::path mj = resolve(path) / "zarr.json";
  if (!fs::exists(mj)) throw ZarrIOError("[nxr/io] no node at \"" + path + "\"");
  const nlohmann::json j = read_json(mj);
  if (j.value("node_type", std::string()) != "array") {
    throw ZarrFormatError("[nxr/io] \"" + path + "\" is not an array");
  }
  return detail::parse_array_json(j);
}

void ZarrStore::write_raw(const std::string& path, const std::uint8_t* data, DType dtype,
                          const std::vector<std::int64_t>& shape, const WriteOptions& opts) {
  std::vector<std::int64_t> chunks = opts.chunks.empty() ? shape : opts.chunks;
  if (chunks.size() != shape.size()) {
    throw ZarrFormatError("[nxr/io] chunks rank != shape rank for \"" + path + "\"");
  }
  for (std::int64_t c : chunks) {
    if (c <= 0) throw ZarrFormatError("[nxr/io] chunk dimensions must be > 0 for \"" + path + "\"");
  }

  const fs::path dir = resolve(path);
  fs::create_directories(dir);
  fs::remove_all(dir / "c");  // clear any stale chunks from a previous write
  write_text(dir / "zarr.json",
             detail::make_array_json(dtype, shape, chunks, opts.fill_value, opts.compress,
                                     opts.zstd_level, opts.attributes)
                 .dump());

  const std::size_t itemsize = dtype_size(dtype);
  const std::int64_t chunk_elems = detail::product(chunks);
  const std::vector<std::int64_t> grid = detail::chunk_grid(shape, chunks);
  const std::int64_t ngrid = detail::product(grid);
  const std::vector<std::uint8_t> fillp = detail::fill_pattern(dtype, opts.fill_value);
  const bool nonzero_fill = std::any_of(fillp.begin(), fillp.end(), [](std::uint8_t b) { return b != 0; });

  const CodecPipeline pipe = CodecPipeline::canonical(opts.compress, opts.zstd_level);

  std::vector<std::int64_t> g(shape.size(), 0);
  for (std::int64_t c = 0; c < ngrid; ++c) {
    std::vector<std::uint8_t> chunkbuf(static_cast<std::size_t>(chunk_elems) * itemsize, 0);
    if (nonzero_fill) {
      for (std::size_t off = 0; off < chunkbuf.size(); off += itemsize) {
        std::memcpy(chunkbuf.data() + off, fillp.data(), itemsize);
      }
    }
    detail::copy_chunk_region(shape, chunks, g, itemsize,
                              const_cast<std::uint8_t*>(data), chunkbuf.data(),
                              /*array_to_chunk=*/true);
    std::vector<std::uint8_t> enc = pipe.encode(chunkbuf.data(), chunkbuf.size());
    const fs::path cf = chunk_path(dir, g);
    fs::create_directories(cf.parent_path());
    write_bytes(cf, enc);
    advance(g, grid);
  }
}

std::vector<std::uint8_t> ZarrStore::read_raw(const std::string& path,
                                              ArrayMetadata& out_meta) const {
  out_meta = read_metadata(path);
  const fs::path dir = resolve(path);
  const std::size_t itemsize = dtype_size(out_meta.dtype);
  const std::int64_t total = detail::product(out_meta.shape);

  std::vector<std::uint8_t> out(static_cast<std::size_t>(total) * itemsize, 0);
  const std::vector<std::uint8_t> fillp = detail::fill_pattern(out_meta.dtype, out_meta.fill_value);
  if (std::any_of(fillp.begin(), fillp.end(), [](std::uint8_t b) { return b != 0; })) {
    for (std::size_t off = 0; off < out.size(); off += itemsize) {
      std::memcpy(out.data() + off, fillp.data(), itemsize);
    }
  }

  const std::int64_t chunk_elems = detail::product(out_meta.chunks);
  const std::vector<std::int64_t> grid = detail::chunk_grid(out_meta.shape, out_meta.chunks);
  const std::int64_t ngrid = detail::product(grid);

  const CodecPipeline pipe(out_meta.codecs);

  std::vector<std::int64_t> g(out_meta.shape.size(), 0);
  for (std::int64_t c = 0; c < ngrid; ++c) {
    const fs::path cf = chunk_path(dir, g);
    if (fs::exists(cf)) {
      std::vector<std::uint8_t> enc = read_bytes(cf);
      const std::size_t raw_size = static_cast<std::size_t>(chunk_elems) * itemsize;
      std::vector<std::uint8_t> dec = pipe.decode(enc.data(), enc.size(), raw_size);
      if (dec.size() != raw_size) {
        throw ZarrFormatError("[nxr/io] decoded chunk size mismatch at \"" + path + "\"");
      }
      detail::copy_chunk_region(out_meta.shape, out_meta.chunks, g, itemsize,
                                out.data(), dec.data(), /*array_to_chunk=*/false);
    }
    advance(g, grid);
  }
  return out;
}

}  // namespace nxr::io
