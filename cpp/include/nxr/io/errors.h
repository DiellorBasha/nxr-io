// nxr-io — exception hierarchy.
#pragma once
#include <stdexcept>

namespace nxr::io {

struct ZarrError : std::runtime_error {
  using std::runtime_error::runtime_error;
};
// Filesystem / I/O failures.
struct ZarrIOError : ZarrError {
  using ZarrError::ZarrError;
};
// Malformed metadata, unknown dtype, shape mismatch, bad chunk.
struct ZarrFormatError : ZarrError {
  using ZarrError::ZarrError;
};
// A store does not conform to its declared schema (validation layer).
struct ZarrSchemaError : ZarrError {
  using ZarrError::ZarrError;
};

}  // namespace nxr::io
