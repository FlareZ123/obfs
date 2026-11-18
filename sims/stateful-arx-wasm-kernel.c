#include <stdint.h>
#include <stddef.h>

static inline uint32_t rotl32(uint32_t x, unsigned n) {
  return (x << n) | (x >> (32u - n));
}

/*
 * State transition matching examples/stateful-arx-app/native/kernel.mjs.
 * Buffer lives at input_pointer; outputs occupy 0x400..0x40f.
 * All arithmetic uses explicit 32-bit modular semantics.
 */
__attribute__((export_name("mix")))
void mix(uint32_t first, uint32_t second, uint32_t third, uint32_t fourth,
         uint32_t input_pointer, uint32_t length, uint32_t base_serial) {
  const uint16_t *units = (const uint16_t *)(uintptr_t)input_pointer;
  uint32_t *out = (uint32_t *)(uintptr_t)0x400u;
  for (uint32_t i = 0; i < length; i++) {
    const uint32_t key = ((uint32_t)units[i]) ^
      ((base_serial + i + 1u) * 0x9e3779b9u);
    const uint32_t a = first + second + key;
    const uint32_t b = second ^ rotl32(third, 7u);
    const uint32_t c = third + rotl32(fourth, 11u) + key;
    const uint32_t d = fourth ^ rotl32(a, 16u);
    first = a ^ rotl32(b, 5u);
    second = b + rotl32(c, 9u);
    third = c ^ rotl32(d, 13u);
    fourth = d + rotl32(a, 21u);
  }
  out[0] = first; out[1] = second;
  out[2] = third; out[3] = fourth;
}
