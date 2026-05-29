cmake_minimum_required(VERSION 3.20)
project(nxr_io_cpp VERSION 0.1.0 LANGUAGES CXX)

# C++17 floor (matches the nxr fleet; C++20 + Eigen trips an Emscripten template bug).
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

# --- libzstd (system; the Zarr v3 `zstd` codec body) ---
find_path(ZSTD_INCLUDE_DIR zstd.h HINTS /opt/homebrew/include /usr/local/include /usr/include)
find_library(ZSTD_LIBRARY NAMES zstd HINTS /opt/homebrew/lib /usr/local/lib /usr/lib)
if(NOT ZSTD_INCLUDE_DIR OR NOT ZSTD_LIBRARY)
  message(FATAL_ERROR "libzstd not found (try: brew install zstd)")
endif()

# --- nlohmann/json (vendored single header) ---
add_library(nlohmann_json INTERFACE)
target_include_directories(nlohmann_json INTERFACE ${CMAKE_CURRENT_SOURCE_DIR}/extern)

# --- core library (sources added as TDD adds them) ---
add_library(nxr_io
  src/codec_zstd.cpp
  src/codec_pipeline.cpp
  src/dtype.cpp
  src/metadata.cpp
  src/chunking.cpp
  src/zarr_store.cpp
  src/sparse.cpp
  src/schema.cpp
)
target_include_directories(nxr_io
  PUBLIC  ${CMAKE_CURRENT_SOURCE_DIR}/include
  PRIVATE ${ZSTD_INCLUDE_DIR})
target_link_libraries(nxr_io PUBLIC nlohmann_json PRIVATE ${ZSTD_LIBRARY})

# Cross-language fixture generator (read back by zarrita in test/crosslang.node.ts).
add_executable(nxr_io_gen test/gen_crosslang.cpp)
target_link_libraries(nxr_io_gen PRIVATE nxr_io)

# --- tests (hand-written + ctest) ---
option(NXR_IO_BUILD_TESTS "Build nxr-io C++ tests" ON)
if(NXR_IO_BUILD_TESTS)
  enable_testing()
  set(NXR_IO_TESTS codec codec_pipeline dtype array_io groups read_existing crud sparse schema)
  foreach(t ${NXR_IO_TESTS})
    add_executable(test_${t} test/test_${t}.cpp)
    target_link_libraries(test_${t} PRIVATE nxr_io)
    target_include_directories(test_${t} PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/test)
    target_compile_definitions(test_${t} PRIVATE
      NXR_IO_DATA_DIR="${CMAKE_CURRENT_SOURCE_DIR}/../test/data"
      NXR_IO_SCHEMA_DIR="${CMAKE_CURRENT_SOURCE_DIR}/../schema")
    add_test(NAME test_${t} COMMAND test_${t})
  endforeach()

  # Optional Eigen interop (header-only). The core library never needs Eigen.
  option(NXR_IO_WITH_EIGEN "Build the optional Eigen interop test" OFF)
  if(NXR_IO_WITH_EIGEN)
    find_path(EIGEN3_INCLUDE_DIR Eigen/Dense
      HINTS /opt/homebrew/include/eigen3 /usr/local/include/eigen3 /usr/include/eigen3)
    if(NOT EIGEN3_INCLUDE_DIR)
      message(FATAL_ERROR "NXR_IO_WITH_EIGEN=ON but Eigen headers not found")
    endif()
    add_executable(test_eigen test/test_eigen.cpp)
    target_link_libraries(test_eigen PRIVATE nxr_io)
    target_include_directories(test_eigen PRIVATE
      ${CMAKE_CURRENT_SOURCE_DIR}/test ${EIGEN3_INCLUDE_DIR})
    target_compile_definitions(test_eigen PRIVATE
      NXR_IO_DATA_DIR="${CMAKE_CURRENT_SOURCE_DIR}/../test/data")
    add_test(NAME test_eigen COMMAND test_eigen)
  endif()
endif()
