// nxr-io — Zarr v3 data types.
#pragma once
#include <cstddef>
#include <cstdint>
#include <string>

namespace nxr::io {

// Zarr v3 core element types this engine handles. `bool` is materialized as
// uint8. (Complex is stored at the schema layer as interleaved float, not a
// Zarr core dtype, so it is not represented here.)
enum class DType {
  Bool, Int8, Int16, Int32, Int64, UInt8, UInt16, UInt32, UInt64, Float32, Float64
};

// Zarr v3 `data_type` string for a DType (e.g. DType::Float64 -> "float64").
const char* dtype_to_string(DType d);

// Parse a Zarr v3 `data_type` string. Throws ZarrFormatError on unknown input.
DType dtype_from_string(const std::string& s);

// Bytes per element.
std::size_t dtype_size(DType d);

// Compile-time C++ type -> DType (used by the typed write/read templates).
// Unsupported T fails to link (no primary definition).
template <class T> DType dtype_of();
template <> inline DType dtype_of<float>()        { return DType::Float32; }
template <> inline DType dtype_of<double>()       { return DType::Float64; }
template <> inline DType dtype_of<std::int8_t>()  { return DType::Int8; }
template <> inline DType dtype_of<std::int16_t>() { return DType::Int16; }
template <> inline DType dtype_of<std::int32_t>() { return DType::Int32; }
template <> inline DType dtype_of<std::int64_t>() { return DType::Int64; }
template <> inline DType dtype_of<std::uint8_t>()  { return DType::UInt8; }
template <> inline DType dtype_of<std::uint16_t>() { return DType::UInt16; }
template <> inline DType dtype_of<std::uint32_t>() { return DType::UInt32; }
template <> inline DType dtype_of<std::uint64_t>() { return DType::UInt64; }

}  // namespace nxr::io
