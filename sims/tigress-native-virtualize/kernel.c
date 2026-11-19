#include <stdint.h>
#include <stddef.h>

#if defined(__GNUC__) || defined(__clang__)
#define NOINLINE __attribute__((noinline))
#else
#define NOINLINE
#endif

NOINLINE uint32_t secretLedgerTransformNative(
    const int32_t *values, size_t length, uint32_t rounds) {
  uint32_t accumulator = 0x13579bdfu;
  for (uint32_t round = 0; round < rounds; round++) {
    for (size_t index = 0; index < length; index++) {
      const uint32_t value = (uint32_t)values[index];
      if ((value & 1u) == 0u) {
        accumulator = (accumulator ^ value) * 1664525u + 1013904223u;
      } else {
        accumulator = (accumulator + value) * 1103515245u ^ 12345u;
      }
      accumulator ^= accumulator >> 13;
    }
  }
  return accumulator;
}
