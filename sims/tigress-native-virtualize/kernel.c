#include <stdint.h>
#include <stddef.h>

#if defined(AMICE_OBF)
#define PROTECT __attribute__((noinline, annotate("+vm_virtualize,vm_runtime_scope=func")))
#elif defined(__GNUC__) || defined(__clang__)
#define PROTECT __attribute__((noinline))
#else
#define PROTECT
#endif

PROTECT uint32_t secretMixWord(uint32_t accumulator, uint32_t value) {
  if ((value & 1u) == 0u) {
    accumulator = (accumulator ^ value) * 1664525u + 1013904223u;
  } else {
    accumulator = (accumulator + value) * 1103515245u ^ 12345u;
  }
  return accumulator ^ (accumulator >> 13);
}

uint32_t secretLedgerTransformNative(
    const int32_t *values, size_t length, uint32_t rounds) {
  uint32_t accumulator = 0x13579bdfu;
  for (uint32_t round = 0; round < rounds; round++) {
    for (size_t index = 0; index < length; index++) {
      accumulator = secretMixWord(accumulator, (uint32_t)values[index]);
    }
  }
  return accumulator;
}
