// Minimal assertion harness for nxr-io C++ tests (fleet convention: hand-written
// test_*.cpp + ctest, no external framework). Each test's main() returns non-zero
// if any CHECK failed, so ctest reports pass/fail.
#pragma once
#include <cstdio>

namespace nxrtest {
inline int& failures() { static int f = 0; return f; }
inline int finish(const char* name) {
  if (failures() == 0) std::printf("PASS %s\n", name);
  else                 std::printf("FAIL %s (%d check(s) failed)\n", name, failures());
  return failures() ? 1 : 0;
}
}  // namespace nxrtest

#define CHECK(cond)                                                            \
  do {                                                                         \
    if (!(cond)) {                                                             \
      std::printf("  CHECK failed: %s @ %s:%d\n", #cond, __FILE__, __LINE__);  \
      ++nxrtest::failures();                                                   \
    }                                                                          \
  } while (0)

#define CHECK_EQ(a, b)                                                         \
  do {                                                                         \
    auto _a = (a);                                                             \
    auto _b = (b);                                                             \
    if (!(_a == _b)) {                                                         \
      std::printf("  CHECK_EQ failed: %s == %s @ %s:%d\n", #a, #b,             \
                  __FILE__, __LINE__);                                         \
      ++nxrtest::failures();                                                   \
    }                                                                          \
  } while (0)
