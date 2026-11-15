# Diversified SNO steady-state performance evaluation

Date: 2026-11-15  
Agent: 2  
Harness: `sims/hotpath-mixed.js`  
CI: [successful manual research run 43679371518](https://github.com/FlareZ123/obfs/actions/runs/43679371518)

## Scope

The objective limits the execution slowdown of transformed JS to 2.5× the original runtime, with a server-side initialization exemption in SNO. This harness measures six deterministic, repeated-use workloads after loading and warmup. Node 22.23.4 Linux x64 CI executed original and transformed functions within separate VM contexts, checked their returned results for exact equality, and measured 15 timed iterations each, alternating the order. The transformations used `mode:'sno'`, with `strings:false` to isolate identifier/property renaming. The benchmark therefore does not estimate the cost of optional eager string decoding, source parsing, obfuscator startup, process startup, or network transport.

## Median measurements

| Workload | Original median (ms) | Transformed median (ms) | Ratio | Renamed objects |
|---|---:|---:|---:|---:|
| Numeric owned-object counter, 1M iterations | 2.669083 | 2.671147 | **1.00077×** | 1 |
| Interprocedural object alias, 1M iterations | 1.111776 | 0.896451 | **0.80632×** | 1 |
| Unicode string length/charCode scan, 100K iterations | 0.176586 | 0.176596 | **1.00006×** | 0 |
| Array reduction, 200K iterations | 0.275706 | 0.276156 | **1.00163×** | 0 |
| External `window.externalValue` calls, 250K iterations | 15.178049 | 15.156206 | **0.99856×** | 0 |
| Reflective `Object.keys` fallback, 100K iterations | 0.194403 | 0.196657 | **1.01159×** | 0 |

All six outputs matched, and all six observed median ratios were below 2.5×. One ratio below 1 indicates a measurement where the transformed code ran faster; it must not be interpreted as guaranteed optimization. The external API case injects the same `window.externalValue` function into both VM contexts; the obfuscator preserves the original external property name.

The complete script prints source SHA-256 hashes, literal/object/property/binding transformation metrics, output sizes, warmup counts, all 15 observed samples per variant, and medians. Measurements are reproducible in GitHub Actions but may differ by JIT tier, CPU, runtime version, GC and isolation.

## Interpretation

The currently tested identifier/property name substitutions impose little measured steady-state overhead. The conservative reflection gate leaves the public shape of the reflective fixture unchanged, consistent with correctness. The interprocedural alias fixture exercises actual local property renaming on 1M repeated operations.

These specific workloads satisfy the 2.5× budget in the measured environment. The experiment does **not** establish that all supported programs do, especially optional eager strings, isolated initialization, parsing, dynamic lookup, or highly optimized JIT edge cases. For COO client startup with strings enabled, see `coo-cold-start-budget-2026-11-15.md`, which measured violations.

The data supports using cheap syntax-level transformations widely while treating expensive runtime decoding as conditional on a measured workload budget.
