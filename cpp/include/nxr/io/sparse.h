// nxr-io — sparse matrix (CSC), matching Eigen's default column-major layout.
#pragma once
#include <cstdint>
#include <vector>

namespace nxr::io {

// Compressed Sparse Column matrix. Mirrors a compressed Eigen::SparseMatrix's
// internal buffers (outerIndexPtr/innerIndexPtr/valuePtr), so the Eigen
// overloads can memcpy with zero conversion. On disk: a group with attributes
// {format:"csc", shape:[rows,cols], nnz} and three sub-arrays:
//   indptr  [cols+1] int32   (column pointers)
//   indices [nnz]    int32   (row indices)
//   data    [nnz]    float64 (values)
struct CscMatrix {
  std::int64_t rows = 0;
  std::int64_t cols = 0;
  std::vector<std::int32_t> indptr;   // length cols+1
  std::vector<std::int32_t> indices;  // length nnz (row indices)
  std::vector<double> data;           // length nnz
  std::int64_t nnz() const { return static_cast<std::int64_t>(data.size()); }
};

}  // namespace nxr::io
