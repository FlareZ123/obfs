# String decoder implementation comparison (intermediate empirical study)

Date: 2026-11-15  
Agent: 2  
Reproducible implementation: `sims/decoder-candidates.js`  
Successful runner: [GitHub Actions 43677401260](https://github.com/FlareZ123/obfs/actions/runs/43677401260)

## Context

The existing COO string transform uses UTF-16 XOR data and reconstructs strings with repeated `decoded += String.fromCharCode(...)`. The previous cold-start study `coo-cold-start-budget-2026-11-15.md` measured 30.6× median slowdown for a 64 KiB literal and 32.2× for 256 literals, exceeding the 2.5× budget. This study compares alternative decoders without changing the deployed transform.

## Candidates

1. **Concatenation**: each XOR-decoded UTF-16 code unit produces a one-character string appended to a growing result (existing strategy).
2. **Character array plus join**: each code unit becomes a one-character string stored into an array, followed by `.join('')`.
3. **Chunked numeric units plus `String.fromCharCode`**: collect 4,096 integer code units, decode each chunk in a single function call, join decoded chunks.

All candidates use equal XOR encoding, dynamically execute each decoder from a fresh VM realm, and compare the final array of strings against unmodified expected text. The 12-unit edge-case fixture includes isolated high/low surrogates, paired surrogates, NUL, line breaks, and U+2028/U+2029. A 4,096-element block avoids very large spread-argument lists while supporting exact JavaScript UTF-16 semantics.

## Measured output (Node 22.23.4, Linux x64)

| Scenario | Concatenation median | Character array median | Chunked numeric median | Chunked speedup |
|---|---:|---:|---:|---:|
| One 65,536-code-unit string, mixed Unicode | 12.104589 ms | 13.284641 ms | 2.309046 ms | **5.24×** |
| 256 strings totaling 65,536 UTF-16 units | 12.204430 ms | 13.168828 ms | 3.268306 ms | **3.73×** |
| Six edge-case strings totaling 12 units | 0.366911 ms | 0.421823 ms | 0.472739 ms | 0.78× (slower) |

All three decoded outputs matched exact UTF-16 content. Each strategy had 5 warmup executions per group and 22 timed executions total. Script compilation was excluded. CPU, garbage collection, runtime implementation, string structure and thermal state can change these ratios.

## Interpretation

Chunked numeric decoding was substantially faster for the two large payloads and slower for the tiny fixture. A size-dependent decoder is a reasonable candidate for implementation and browser benchmarking. This microbenchmark isolates the runtime decoder loop and is not a whole-program 2.5× compliance test.

Even a large optimization may leave a cold script with very little original initialization work above the 2.5× limit. A principled policy must consider original cold-start cost, whether strings are actually accessed, and the security value of encoding. Declining or deferring expensive transformations when the budget cannot be met remains an important research option.

## Next validation

- Implement the chunked strategy in an isolated feature flag, test literal escapes and all 65,536 code-unit values, and compare browsers (Chromium, Firefox, Safari) and Node.
- Benchmark the full transform with 4 KiB, 64 KiB, 256-literal cases from `sims/cold-start.js`; check both runtime and output size.
- Test small-string regressions and repeated hot-path accesses before enabling by default.
- Retain the old decoder as a baseline for regression and security evaluations.

Findings are preliminary empirical results under the specified Node CI environment.
