cmake_minimum_required(VERSION 3.24)
project(nxr_io_wasm LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

set(CORE ${CMAKE_CURRENT_SOURCE_DIR}/../../cpp)

# zstd compiled from source for wasm (the native libzstd can't be linked here).
include(FetchContent)
set(ZSTD_BUILD_PROGRAMS OFF CACHE BOOL "" FORCE)
set(ZSTD_BUILD_SHARED   OFF CACHE BOOL "" FORCE)
set(ZSTD_BUILD_STATIC   ON  CACHE BOOL "" FORCE)
set(ZSTD_BUILD_TESTS    OFF CACHE BOOL "" FORCE)
FetchContent_Declare(zstd
  URL https://github.com/facebook/zstd/releases/download/v1.5.6/zstd-1.5.6.tar.gz
  SOURCE_SUBDIR build/cmake)
FetchContent_MakeAvailable(zstd)

add_executable(nxr_io
  ${CORE}/src/codec_zstd.cpp
  ${CORE}/src/codec_pipeline.cpp
  ${CORE}/src/dtype.cpp
  ${CORE}/src/metadata.cpp
  ${CORE}/src/chunking.cpp
  ${CORE}/src/zarr_store.cpp
  ${CORE}/src/sparse.cpp
  src/nxr_io_wasm.cpp
)
target_include_directories(nxr_io PRIVATE
  ${CORE}/include
  ${CORE}/extern
  ${zstd_SOURCE_DIR}/lib)
target_link_libraries(nxr_io PRIVATE libzstd_static)

target_link_options(nxr_io PRIVATE
  "--bind"
  "-sMODULARIZE=1"
  "-sEXPORT_NAME=createNxrIoModule"
  "-sEXPORT_ES6=1"
  "-sALLOW_MEMORY_GROWTH=1"
  "-sFORCE_FILESYSTEM=1"
  "-sEXPORTED_RUNTIME_METHODS=['FS']"
  "-sENVIRONMENT=web,worker,node"
  "-sNO_EXIT_RUNTIME=1"
  "-sINVOKE_RUN=0")

set_target_properties(nxr_io PROPERTIES OUTPUT_NAME "nxr_io" SUFFIX ".js")
