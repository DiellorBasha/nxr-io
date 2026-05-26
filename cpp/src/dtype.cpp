#include "nxr/io/types.h"
#include "nxr/io/errors.h"

namespace nxr::io {

const char* dtype_to_string(DType d) {
  switch (d) {
    case DType::Bool:    return "bool";
    case DType::Int8:    return "int8";
    case DType::Int16:   return "int16";
    case DType::Int32:   return "int32";
    case DType::Int64:   return "int64";
    case DType::UInt8:   return "uint8";
    case DType::UInt16:  return "uint16";
    case DType::UInt32:  return "uint32";
    case DType::UInt64:  return "uint64";
    case DType::Float32: return "float32";
    case DType::Float64: return "float64";
  }
  return "";
}

DType dtype_from_string(const std::string& s) {
  if (s == "bool")    return DType::Bool;
  if (s == "int8")    return DType::Int8;
  if (s == "int16")   return DType::Int16;
  if (s == "int32")   return DType::Int32;
  if (s == "int64")   return DType::Int64;
  if (s == "uint8")   return DType::UInt8;
  if (s == "uint16")  return DType::UInt16;
  if (s == "uint32")  return DType::UInt32;
  if (s == "uint64")  return DType::UInt64;
  if (s == "float32") return DType::Float32;
  if (s == "float64") return DType::Float64;
  throw ZarrFormatError("[nxr/io] unknown data_type: \"" + s + "\"");
}

std::size_t dtype_size(DType d) {
  switch (d) {
    case DType::Bool:
    case DType::Int8:
    case DType::UInt8:   return 1;
    case DType::Int16:
    case DType::UInt16:  return 2;
    case DType::Int32:
    case DType::UInt32:
    case DType::Float32: return 4;
    case DType::Int64:
    case DType::UInt64:
    case DType::Float64: return 8;
  }
  return 0;
}

}  // namespace nxr::io
