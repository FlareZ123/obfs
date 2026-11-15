# Public native ESM bitvector sharding (2026-11-15)

**Status:** experimental opt-in COO layout transform, generated before/after available. No static confidentiality claimed.

## Technique and contract

`shardNativeBitvectorModule` accepts explicitly selected top-level exported functions of one primitive signed Int32 Number input. It proves a small, pure bitwise AST grammar, divides the root expression's left and right operator subtrees into two generated ESM function modules, and preserves the original exported function name/signature as a thin native-operator composition. It seeds generated binding names and sibling filenames. The source file is parsed with Acorn; unsupported functions decline. Caller must ensure closed deployment and no outside source or stack observers.

The checked-in example under `examples/coo-native-shards/` pins a real three-file output and builder. A standalone test compares 12 generated seeds against 519 native signed-Int32 inputs each (6,228 comparisons), exercises safety refusals and collisions, and includes a source-only AST attacker which statically follows public ESM imports to reconstruct the exact expression tree for every seed, with no build seed or original source.

## Local diagnostic performance

The paired, reproducible profile `sims/coo-native-shards-profile.js` measures 72 post-warmup independent ESM graph loads and 21 alternated 600,000-call hot trials. On local Node.js 22.16.0 Linux, median graph-load times were 0.307993 ms native and 0.706864 ms sharded, giving **2.2951x**. Hot-loop medians were 2.829545 ms native and 3.151720 ms sharded, giving **1.1139x**. These numbers are not platform-independent; Node loader and JIT behavior influence them. Different graphs or browsers can exceed the 2.5x total runtime budget. No startup deduction applies to COO.

## Threat-model conclusions

- **Static program reconstruction:** trivial across these public files for the tested grammar, as the independent attacker proves. The module split does not hide either subtree or introduce a secret.
- **Dynamic tracing:** all public helpers can be instrumented or individually invoked; no dynamic barrier.
- **Tamper resistance:** all three files are attacker-editable; no trusted integrity check.
- **Execution authorization:** original host restrictions are untouched; no new environment lock.
- **Compatibility:** restricted to signed primitive Int32 caller guarantees and no outside source observer; synthetic ESM import changes module-loader hooks and can alter stack traces outside contract.
- **Performance:** the local pilot meets 2.5x in the selected hot and loader samples; separate cross-platform and end-to-end measurements are required for deployment.

This transform contributes a reproducible engineering point in the layout/performance design space. It should remain experimental until independently evaluated against broader typed kernels and real browser graphs.

## Pinned paired topology and whole-session measurement

The adaptive two-file `topology:'paired'` mode places both pure subexpressions in one sibling ESM file, leaving the public entry function name and parameter unchanged. The original three-file `topology:'split'` mode remains available for structural comparison. The checked-in `after-paired/` directory contains real generated modules; `build.cjs` checks both layouts byte-for-byte. An independent seedless AST attacker recovers the original expression from either topology.

The full manual-only Linux/Windows and real Chromium gate [43747719775](https://github.com/FlareZ123/obfs/actions/runs/43747719775), pinned at `782ec673515b1702c0cbeea1737e073bce9e241b`, **passed** both layouts and their paired startup/hot profiles. Strict external JSDoc, AST differential attacks, generated sample checks, and 4,097 Chromium typed cases per topology also passed.

The whole-session benchmark `sims/coo-native-shards-session.js` alternates 52 fresh module-graph pairs per call count, excludes 12 warmup pairs, and times dynamic ESM import together with 0 through 65,536 bitvector invocations. This includes asynchronous module loading; file creation and offline obfuscation stay outside the timed interval, as they would for an already deployed COO application. The measured median total-time ratios were:

| Calls per fresh module lifetime | Ubuntu paired (2 files) | Windows paired (2 files) | Ubuntu split (3 files) | Windows split (3 files) |
|---:|---:|---:|---:|---:|
| 0 | 1.800x | 1.904x | 2.367x | 2.678x |
| 1 | 1.788x | 1.849x | 2.277x | 2.586x |
| 16 | 1.822x | 1.924x | 2.287x | 2.621x |
| 1,024 | 1.839x | 1.932x | 2.168x | 2.599x |
| 8,192 | 1.724x | 2.179x | 1.947x | 2.545x |
| 65,536 | 1.556x | 1.686x | 1.745x | 1.932x |

**Paired stayed below 2.5x for all six sampled lifetimes on both hosts; split exceeded 2.5x for five Windows lifetimes.** This establishes a concrete architecture/performance preference for this typed sample, without a guarantee for another program, OS, browser, or loader. Fresh module ESM loading is wall time, not strictly CPU compute; JIT tiering and ESM cache behavior influence these microbenchmarks. A fully integrated browser application cost study remains pending. The standalone module graph-load medians in the same run were 1.837x paired and 2.228x split on Ubuntu, and 1.918x paired and 2.607x split on Windows; hot medians were near 1.0x-1.1x on this kernel.

The entry's hashbang and directive prologue are now preserved ahead of generated imports, and explicit tests cover a cyclic ESM peer calling the exported function before entry-module evaluation. Those added compatibility tests postdate this pinned run and require a follow-up pin. No static or dynamic security improvement is inferred from the lower-cost topology.

## Broader grammar, cyclic imports, and Chromium diagnostic

The later cross-platform manual run [43748684953](https://github.com/FlareZ123/obfs/actions/runs/43748684953) at immutable source commit `1c4b3516da9a64df4b85d83ba72476e83c920992` passed seven semantic/negative tests including **50 seeded generated bitwise expression graphs**, each checked on 519 typed input values (25,950 graph-input checks), and a source-only attacker that exactly reconstructed each graph. It additionally passed ESM cyclic imports that invoke a protected export early, preservation of `#!` hashbang and first `"use client"` directive, exact generated files, strict JSDoc, Ubuntu/Windows Node session profiles, and real Chromium behavior with an external page-owned API.

A new asynchronous browser-side HTTP-module session diagnostic requested 70 fresh ESM graphs per variant. **Chromium's headless virtual-time clock quantized all five measured native imports to 10 ms and paired/split imports to 20 ms.** The exact apparent 2x ratio is an artifact-prone coarse measurement, with no sensitivity across 0 to 65,536 calls. It is **excluded from the 2.5x budget evidence**. Future researchers should repeat the measurement with a higher-resolution real-time instrumentation strategy, real deployment page loads, and representative network/CPU conditions before asserting browser total-time compliance.

The strongest currently defensible conclusion remains the pinned Node.js whole-session tradeoff on two operating systems and the independent source-only reconstruction of all tested public shards. The browser semantic test shows behavior for its sampled values; it does not prove browser runtime-budget compliance. Production integration into the COO pipeline is intentionally deferred pending full-program caller preconditions, a closed-world source-observation proof and cross-browser performance.
