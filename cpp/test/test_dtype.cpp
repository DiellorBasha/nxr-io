#include "nxr/io/types.h"
#include "nxr/io/errors.h"
#include "check.h"
#include <string>

using namespace nxr::io;

int main() {
  CHECK_EQ(dtype_size(DType::Float64), static_cast<std::size_t>(8));
  CHECK_EQ(dtype_size(DType::Float32), static_cast<std::size_t>(4));
  CHECK_EQ(dtype_size(DType::Int64),   static_cast<std::size_t>(8));
  CHECK_EQ(dtype_size(DType::Int32),   static_cast<std::size_t>(4));
  CHECK_EQ(dtype_size(DType::Int16),   static_cast<std::size_t>(2));
  CHECK_EQ(dtype_size(DType::UInt8),   static_cast<std::size_t>(1));
  CHECK_EQ(dtype_size(DType::Bool),    static_cast<std::size_t>(1));

  CHECK(std::string(dtype_to_string(DType::Float64)) == "float64");
  CHECK(std::string(dtype_to_string(DType::Int32))   == "int32");
  CHECK(std::string(dtype_to_string(DType::Bool))    == "bool");

  CHECK(dtype_from_string("float32") == DType::Float32);
  CHECK(dtype_from_string("int32")   == DType::Int32);
  CHECK(dtype_from_string("uint8")   == DType::UInt8);

  // Round-trip every dtype.
  const DType all[] = {DType::Bool, DType::Int8, DType::Int16, DType::Int32, DType::Int64,
                       DType::UInt8, DType::UInt16, DType::UInt32, DType::UInt64,
                       DType::Float32, DType::Float64};
  for (DType d : all) CHECK(dtype_from_string(dtype_to_string(d)) == d);

  // Unknown dtype throws ZarrFormatError.
  bool threw = false;
  try { dtype_from_string("float128"); } catch (const ZarrFormatError&) { threw = true; }
  CHECK(threw);

  return nxrtest::finish("dtype");
}
