#include "chunking.h"

#include <algorithm>
#include <cstring>

namespace nxr::io::detail {

std::int64_t product(const std::vector<std::int64_t>& dims) {
  std::int64_t p = 1;
  for (std::int64_t d : dims) p *= d;
  return p;
}

std::vector<std::int64_t> chunk_grid(const std::vector<std::int64_t>& shape,
                                     const std::vector<std::int64_t>& chunks) {
  std::vector<std::int64_t> grid(shape.size());
  for (std::size_t d = 0; d < shape.size(); ++d) {
    grid[d] = (shape[d] + chunks[d] - 1) / chunks[d];  // ceil
  }
  return grid;
}

void copy_chunk_region(const std::vector<std::int64_t>& shape,
                       const std::vector<std::int64_t>& chunks,
                       const std::vector<std::int64_t>& g, std::size_t itemsize,
                       std::uint8_t* array_buf, std::uint8_t* chunk_buf,
                       bool array_to_chunk) {
  const int n = static_cast<int>(shape.size());
  if (n == 0) {  // scalar
    if (array_to_chunk) std::memcpy(chunk_buf, array_buf, itemsize);
    else                std::memcpy(array_buf, chunk_buf, itemsize);
    return;
  }

  std::vector<std::int64_t> e(n), astart(n), as(n), cs(n);
  for (int d = 0; d < n; ++d) {
    astart[d] = g[d] * chunks[d];
    const std::int64_t end = std::min((g[d] + 1) * chunks[d], shape[d]);
    e[d] = end - astart[d];  // in-bounds extent along d (1..chunks[d])
  }
  as[n - 1] = 1;
  cs[n - 1] = 1;
  for (int d = n - 2; d >= 0; --d) {
    as[d] = as[d + 1] * shape[d + 1];
    cs[d] = cs[d + 1] * chunks[d + 1];
  }

  const std::int64_t run = e[n - 1];  // contiguous inner run (elements)
  std::vector<std::int64_t> idx(n > 0 ? n - 1 : 0, 0);

  while (true) {
    std::int64_t aoff = astart[n - 1] * as[n - 1];
    std::int64_t coff = 0;
    for (int d = 0; d < n - 1; ++d) {
      aoff += (astart[d] + idx[d]) * as[d];
      coff += idx[d] * cs[d];
    }
    std::uint8_t* aptr = array_buf + static_cast<std::size_t>(aoff) * itemsize;
    std::uint8_t* cptr = chunk_buf + static_cast<std::size_t>(coff) * itemsize;
    if (array_to_chunk) std::memcpy(cptr, aptr, static_cast<std::size_t>(run) * itemsize);
    else                std::memcpy(aptr, cptr, static_cast<std::size_t>(run) * itemsize);

    if (n - 1 == 0) break;  // 1-D: single run
    int d = n - 2;
    while (d >= 0) {
      if (++idx[d] < e[d]) break;
      idx[d] = 0;
      --d;
    }
    if (d < 0) break;
  }
}

}  // namespace nxr::io::detail
