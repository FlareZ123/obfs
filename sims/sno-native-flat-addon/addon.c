#include <node_api.h>
#include <stdint.h>
#include <stddef.h>

#if defined(_MSC_VER)
#define NOINLINE __declspec(noinline)
#else
#define NOINLINE __attribute__((noinline))
#endif

static volatile uint32_t encoded_constants[5] = {
  0x9e2e1fb4u,
  0x43248f4au,
  0x90730458u,
  0x94d07982u,
  0x36126f4eu
};

static volatile uint32_t decode_keys[5] = {
  0x9e3779b9u,
  0x7f4a7c15u,
  0xd1b54a35u,
  0x94d049bbu,
  0x2545f491u
};

static NOINLINE uint32_t decode_constant(size_t index) {
  return encoded_constants[index] ^ decode_keys[index];
}

static NOINLINE uint32_t protectedLedgerTransformNative(
    const int32_t *values, size_t length, uint32_t rounds) {
  const uint32_t even_mul = decode_constant(0);
  const uint32_t even_add = decode_constant(1);
  const uint32_t odd_mul = decode_constant(2);
  const uint32_t odd_xor = decode_constant(3);
  uint32_t accumulator = decode_constant(4);

  for (uint32_t round = 0; round < rounds; round++) {
    for (size_t index = 0; index < length; index++) {
      const uint32_t value = (uint32_t)values[index];
      const uint32_t even =
          (accumulator ^ value) * even_mul + even_add;
      const uint32_t odd =
          (accumulator + value) * odd_mul ^ odd_xor;
      const uint32_t odd_mask = 0u - (value & 1u);
      accumulator = (even & ~odd_mask) | (odd & odd_mask);
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

  const uint32_t result = protectedLedgerTransformNative(
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
