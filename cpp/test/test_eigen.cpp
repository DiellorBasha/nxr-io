#include "nxr/io/eigen.h"
#include "check.h"

#include <Eigen/Dense>
#include <Eigen/Sparse>
#include <filesystem>
#include <vector>

namespace fs = std::filesystem;
using namespace nxr::io;

int main() {
  fs::path tmp = fs::temp_directory_path() / "nxr_io_eigen.zarr";
  fs::remove_all(tmp);
  ZarrStore store(tmp);

  // Dense: Eigen col-major in memory -> C-order on disk -> back.
  Eigen::MatrixXd M(3, 4);
  M << 1, 2, 3, 4,
       5, 6, 7, 8,
       9, 10, 11, 12;
  eigen::write_matrix(store, "M", M);

  auto meta = store.read_metadata("M");
  CHECK(meta.shape == std::vector<std::int64_t>({3, 4}));  // row-major [rows,cols]

  Eigen::MatrixXd R = eigen::read_matrix<double>(store, "M");
  CHECK(R.rows() == 3);
  CHECK(R.cols() == 4);
  CHECK(R.isApprox(M));

  // Element-order check via the raw on-disk buffer (must be row-major C-order).
  auto flat = store.read_array<double>("M");
  CHECK_EQ(flat.size(), static_cast<std::size_t>(12));
  CHECK(flat[0] == 1 && flat[1] == 2 && flat[4] == 5);  // row 0 then row 1 ...

  // Sparse CSC: [[10,0,0],[0,20,0],[5,0,30]].
  Eigen::SparseMatrix<double> S(3, 3);  // column-major (Eigen default)
  std::vector<Eigen::Triplet<double>> t = {{0, 0, 10}, {2, 0, 5}, {1, 1, 20}, {2, 2, 30}};
  S.setFromTriplets(t.begin(), t.end());
  S.makeCompressed();
  eigen::write_sparse(store, "S", S);

  auto a = store.read_attributes("S");
  CHECK(a.value("format", std::string()) == "csc");
  // CSC arrays must match Eigen's internal buffers exactly.
  auto indptr = store.read_array<std::int32_t>("S/indptr");
  CHECK(indptr == std::vector<std::int32_t>({0, 2, 3, 4}));

  Eigen::SparseMatrix<double> S2 = eigen::read_sparse<double>(store, "S");
  CHECK(S2.rows() == 3);
  CHECK(S2.cols() == 3);
  CHECK(S2.nonZeros() == 4);
  CHECK((Eigen::MatrixXd(S2) - Eigen::MatrixXd(S)).norm() < 1e-12);

  return nxrtest::finish("eigen");
}
