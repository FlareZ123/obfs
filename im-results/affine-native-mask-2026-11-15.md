# Seeded native affine masking for bounded 32-bit additive chains

**Agent:** 32, 15 November 2026. **Status:** experimental, opt-in, intermediate evidence. This is not an established confidentiality or tamper-resistance result.

## Implementation and tested grammar

The experimental CommonJS module [src/affine-native.js](../src/affine-native.js) exposes `lowerAffineNative(source, sourceType, {seed, names})`. It selects named top-level synchronous single-parameter functions with exactly one return, shaped as a left-associated chain whose first and final operators are `|0` and whose intervening operators are 8–64 additions/subtractions of integer constants 0–255. It rejects unproved expressions, duplicate function declarations, dynamic scope, and source observers recognized by the shared AST scanner. Unselected source remains unchanged. The backend is not wired into production defaults or CLIs.

Write the original value after step i as v_i in Z/(2^32). The transform maintains the encoded value r_i = A_i v_i + B_i (mod 2^32), where each A_i is either A or -A, with A = 1 + 65536k and 1 <= k <= 31. Its modular inverse is 1 - 65536k. Fresh seed-derived offsets B_i and independently varied signs obfuscate intermediate values. The generated code uses ordinary JavaScript integer truncation and arithmetic, preserving a single initial `x|0` coercion. The magnitude of all multiplications is bounded to the exact integer range of IEEE-754 Numbers.

## Reproduction and attacks

- [Original CommonJS kernel](../examples/affine-native/before.cjs), [actual generated 16-step output](../examples/affine-native/after.cjs), and [deterministic reproduction/check script](../examples/affine-native/build-sample.cjs).
- [Differential test](../test/affine-native.test.js): seven local Node tests passed, including 20,000 integer inputs, nonnumeric coercion, BigInt and Symbol exceptions, object `Symbol.toPrimitive` call order, 60 seeded randomized graphs each tested on 200 inputs, source-preserving refusal cases, distinct seeds and names, and a two-file ESM bridge that retains its external `globalThis.externalBridge.accept` spelling.
- [Independent seedless source-only attacker](../sims/affine-native-recover.js) parses generated code using Acorn, symbolically propagates affine coefficients, and recovers the sample's normalized computation `((x|0)+42)|0`. It succeeds for all 60 fuzzed variants without the compiler seed, original source, or target execution. This is concrete negative security evidence. The generated output is directly instrumentable and host checks can be bypassed under COO/SNO attacker control.

## Isolated Node.js 22.16.0 Linux x64 performance

Reproduce through [the profiler](../sims/affine-native-profile.js). Seven test cases were also run locally, but **no Windows or full browser CI result is claimed**. One sampled profile, with eight warmups, alternating orders and median times, returned:

| Workload | Original median | Transformed median | Ratio |
| --- | ---: | ---: | ---: |
| 600,000 dense calls | 2.542135 ms | 3.665251 ms | **1.442x** |
| 1.2m-loop mixed workload, one call per 128 | 1.525464 ms | 1.416664 ms | **0.929x** |
| Cold dynamic compilation surrogate | 0.001517 ms | 0.004142 ms | **2.730x** |

The 2.5x hot-path budget was satisfied only for the sampled workloads, and the cold-start surrogate exceeded it. The surrogate does not represent full page-load time. The output grew from 243 to 1,183 bytes (4.87x). These are short, JIT-sensitive timings; no universal performance bound follows.

## Decision

Keep the backend isolated and opt-in as a semantics-conscious structure transform. The successful source-only reconstruction gives **no measured gain** against an adversary who receives the transformed code. No SCO trusted-server boundary or COO/SNO tamper resistance is introduced. Further adoption requires workload-specific end-to-end tests, browser/Windows integration, and an adversary that fails on a meaningful protected computation.