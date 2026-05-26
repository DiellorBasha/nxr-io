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
  src/dtype.cpp
  src/metadata.cpp
  src/chunking.cpp
  src/zarr_store.cpp
)
target_include_directories(nxr_io
  PUBLIC  ${CMAKE_CURRENT_SOURCE_DIR}/include
  PRIVATE ${ZSTD_INCLUDE_DIR})
target_link_libraries(nxr_io PUBLIC nlohmann_json PRIVATE ${ZSTD_LIBRARY})

# --- tests (hand-written + ctest) ---
option(NXR_IO_BUILD_TESTS "Build nxr-io C++ tests" ON)
if(NXR_IO_BUILD_TESTS)
  enable_testing()
  set(NXR_IO_TESTS codec dtype array_io groups read_existing)
  foreach(t ${NXR_IO_TESTS})
    add_executable(test_${t} test/test_${t}.cpp)
    target_link_libraries(test_${t} PRIVATE nxr_io)
    target_include_directories(test_${t} PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/test)
    target_compile_definitions(test_${t} PRIVATE
      NXR_IO_DATA_DIR="${CMAKE_CURRENT_SOURCE_DIR}/../test/data")
    add_test(NAME test_${t} COMMAND test_${t})
  endforeach()
endif()
