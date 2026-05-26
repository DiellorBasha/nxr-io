// nxr-io — OPTIONAL Eigen interop (header-only). Include only where Eigen is
// available; the core library does not depend on Eigen. Dense matrices convert
// between Eigen's column-major default and Zarr's C-order (row-major); sparse
// matrices map directly to/from CSC with no COO conversion.
#pragma once
#include <cstdint>
#include <string>
#include <vector>

#include <Eigen/Dense>
#include <Eigen/Sparse>

#include "nxr/io/zarr_store.h"

namespace nxr::io::eigen {

// Write an Eigen dense matrix as a 2-D array [rows, cols] in C-order (row-major).
template <class Derived>
void write_matrix(ZarrStore& store, const std::string& path,
                  const ::Eigen::MatrixBase<Derived>& mat, const WriteOptions& opts = {}) {
  using Scalar = typename Derived::Scalar;
  // Force a row-major copy so .data() is contiguous C-order matching the shape.
  ::Eigen::Matrix<Scalar, ::Eigen::Dynamic, ::Eigen::Dynamic, ::Eigen::RowMajor> rm = mat;
  store.write_array<Scalar>(path, rm.data(),
                            {static_cast<std::int64_t>(rm.rows()),
                             static_cast<std::int64_t>(rm.cols())},
                            opts);
}

// Read a 2-D array into a (column-major) Eigen matrix.
template <class Scalar = double>
::Eigen::Matrix<Scalar, ::Eigen::Dynamic, ::Eigen::Dynamic>
read_matrix(const ZarrStore& store, const std::string& path) {
  const ArrayMetadata meta = store.read_metadata(path);
  if (meta.shape.size() != 2) {
    throw ZarrFormatError("[nxr/io] read_matrix expects a 2-D array at \"" + path + "\"");
  }
  const auto rows = static_cast<::Eigen::Index>(meta.shape[0]);
  const auto cols = static_cast<::Eigen::Index>(meta.shape[1]);
  const std::vector<Scalar> flat = store.read_array<Scalar>(path);
  // On-disk is row-major; map as RowMajor then return (Eigen copies to col-major).
  return ::Eigen::Map<const ::Eigen::Matrix<Scalar, ::Eigen::Dynamic, ::Eigen::Dynamic,
                                            ::Eigen::RowMajor>>(flat.data(), rows, cols);
}

// Write an Eigen sparse matrix as CSC (zero structural conversion: copies the
// compressed column pointers / row indices / values directly).
template <class Scalar = double>
void write_sparse(ZarrStore& store, const std::string& path,
                  const ::Eigen::SparseMatrix<Scalar>& matrix, const WriteOptions& opts = {}) {
  // Ensure column-major + int32 storage index + compressed.
  ::Eigen::SparseMatrix<Scalar, ::Eigen::ColMajor, std::int32_t> m = matrix;
  m.makeCompressed();
  const std::int32_t nnz = static_cast<std::int32_t>(m.nonZeros());

  CscMatrix c;
  c.rows = m.rows();
  c.cols = m.cols();
  c.indptr.assign(m.outerIndexPtr(), m.outerIndexPtr() + m.cols() + 1);
  c.indices.assign(m.innerIndexPtr(), m.innerIndexPtr() + nnz);
  c.data.resize(static_cast<std::size_t>(nnz));
  const Scalar* vals = m.valuePtr();
  for (std::int32_t i = 0; i < nnz; ++i) c.data[i] = static_cast<double>(vals[i]);

  store.write_sparse(path, c, opts);
}

// Read a CSC sparse group into a column-major Eigen sparse matrix.
template <class Scalar = double>
::Eigen::SparseMatrix<Scalar> read_sparse(const ZarrStore& store, const std::string& path) {
  CscMatrix c = store.read_sparse(path);
  ::Eigen::SparseMatrix<Scalar> out(c.rows, c.cols);
  if (c.nnz() == 0) return out;
  const ::Eigen::Map<const ::Eigen::SparseMatrix<double, ::Eigen::ColMajor, std::int32_t>> mapped(
      c.rows, c.cols, c.nnz(), c.indptr.data(), c.indices.data(), c.data.data());
  out = mapped.cast<Scalar>();
  return out;
}

}  // namespace nxr::io::eigen
