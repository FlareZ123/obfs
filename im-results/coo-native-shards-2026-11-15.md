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
