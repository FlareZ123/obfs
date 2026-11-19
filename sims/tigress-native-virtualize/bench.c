#define _POSIX_C_SOURCE 200809L
#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <time.h>

uint32_t secretLedgerTransformNative(
    const int32_t *values, size_t length, uint32_t rounds);

static uint64_t now_ns(void) {
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  return (uint64_t)ts.tv_sec * UINT64_C(1000000000) + (uint64_t)ts.tv_nsec;
}

static void fill_values(int32_t *values, size_t length, uint32_t seed) {
  uint32_t state = seed;
  for (size_t index = 0; index < length; index++) {
    state = state * 1664525u + 1013904223u;
    values[index] = (int32_t)state;
  }
}

static void sort_u64(uint64_t *values, size_t length) {
  for (size_t i = 1; i < length; i++) {
    uint64_t value = values[i];
    size_t j = i;
    while (j > 0 && values[j - 1] > value) {
      values[j] = values[j - 1];
      j--;
    }
    values[j] = value;
  }
}

int main(void) {
  enum { LENGTH = 256, SAMPLES = 9 };
  int32_t values[LENGTH];
  uint64_t samples[SAMPLES];
  fill_values(values, LENGTH, UINT32_C(0x10293847));

  uint32_t check = secretLedgerTransformNative(values, LENGTH, 7);
  if (check != UINT32_C(0xd163af68)) {
    fprintf(stderr, "parity check mismatch: 0x%08" PRIx32 "\n", check);
    return 2;
  }

  for (int warm = 0; warm < 4; warm++) {
    (void)secretLedgerTransformNative(values, LENGTH, 300);
  }

  uint32_t result = 0;
  for (size_t sample = 0; sample < SAMPLES; sample++) {
    uint64_t started = now_ns();
    result ^= secretLedgerTransformNative(values, LENGTH, 5000);
    samples[sample] = now_ns() - started;
  }
  sort_u64(samples, SAMPLES);
  printf("TIGRESS_NATIVE_BENCH result=%" PRIu32 " median_ns=%" PRIu64 "\n",
      result, samples[SAMPLES / 2]);
  return 0;
}
