// Writes a known store with the C++ engine, for the cross-language test (read
// back by zarrita / @nxr/io). Usage: nxr_io_gen <out.zarr>
#include "nxr/io/zarr_store.h"

#include <cstdint>
#include <cstdio>
#include <vector>

using namespace nxr::io;

int main(int argc, char** argv) {
  if (argc < 2) {
    std::fprintf(stderr, "usage: nxr_io_gen <out.zarr>\n");
    return 2;
  }
  ZarrStore store(argv[1]);

  // Dense float64 [3,5] with EDGE chunks [2,3] (grid 2x2), zstd-compressed.
  std::vector<double> lf(15);
  for (int i = 0; i < 15; ++i) lf[i] = i;  // 0..14, row-major
  WriteOptions o;
  o.chunks = {2, 3};
  store.write_array<double>("leadfield", lf, {3, 5}, o);

  // int32 [4].
  std::vector<std::int32_t> vn = {10, 20, 30, 40};
  store.write_array<std::int32_t>("vertno", vn, {4});

  // CSC sparse 3x3: [[10,0,0],[0,20,0],[5,0,30]].
  CscMatrix m;
  m.rows = 3;
  m.cols = 3;
  m.indptr  = {0, 2, 3, 4};
  m.indices = {0, 2, 1, 2};
  m.data    = {10, 5, 20, 30};
  store.write_sparse("operators/stiffness", m);

  return 0;
}
