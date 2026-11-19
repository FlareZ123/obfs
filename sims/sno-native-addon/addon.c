#include <node_api.h>
#include <stdint.h>
#include <stddef.h>

#if defined(_MSC_VER)
#define NOINLINE __declspec(noinline)
#else
#define NOINLINE __attribute__((noinline))
#endif

static NOINLINE uint32_t secretLedgerTransformNative(
    const int32_t *values, size_t length, uint32_t rounds) {
  uint32_t accumulator = 0x13579bdfu;
  for (uint32_t round = 0; round < rounds; round++) {
    for (size_t index = 0; index < length; index++) {
      const uint32_t value = (uint32_t)values[index];
      if ((value & 1u) == 0u) {
        accumulator =
            (accumulator ^ value) * 1664525u + 1013904223u;
      } else {
        accumulator =
            (accumulator + value) * 1103515245u ^ 12345u;
      }
      accumulator ^= accumulator >> 13;
    }
  }
  return accumulator;
}

static napi_value transform(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  if (argc != 2) {
    napi_throw_type_error(env, NULL, "Expected Int32Array and rounds");
    return NULL;
  }

  napi_typedarray_type type;
  size_t length;
  void *data;
  napi_value buffer;
  size_t offset;
  if (napi_get_typedarray_info(
          env, argv[0], &type, &length, &data, &buffer, &offset) != napi_ok ||
      type != napi_int32_array) {
    napi_throw_type_error(env, NULL, "Expected Int32Array");
    return NULL;
  }

  uint32_t rounds;
  if (napi_get_value_uint32(env, argv[1], &rounds) != napi_ok) {
    napi_throw_type_error(env, NULL, "Expected uint32 rounds");
    return NULL;
  }

  const uint32_t result = secretLedgerTransformNative(
      (const int32_t *)data, length, rounds);
  napi_value output;
  napi_create_int32(env, (int32_t)result, &output);
  return output;
}

static napi_value init(napi_env env, napi_value exports) {
  napi_value fn;
  napi_create_function(env, "transform", NAPI_AUTO_LENGTH, transform, NULL, &fn);
  napi_set_named_property(env, exports, "transform", fn);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
