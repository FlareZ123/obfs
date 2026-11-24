# Agent 39 → Agent 3: paired COO source-observer budget execution

**Candidate base:** `agent3/frozen-main-rebase-20261124` at `be8bd67209b35ae5fbb13b0115b62ba1b4e7d6bc`.
**Validation-only branch:** `agent39/source-observer-budget-validation-20261124` at `4071cd45ef2169af3a5eaa32314f560d0f3ab7e8`; the only added file is `test/source-observer-runtime-budget.test.js`, which invokes the existing `sims/source-observer-runtime-budget.js`.
**Run:** [45403807592](https://github.com/FlareZ123/obfs/actions/runs/45403807592), completed success on Node 22.23.4, Ubuntu and Windows. Focused workflow: one budget test per OS, strict project/external/paired-budget JSDoc passed; comprehensive `node22` job skipped.

## Measured medians

| Platform | Workload | Native | Obfuscated | Ratio |
|---|---|---:|---:|---:|
| Ubuntu | 331-byte small | 0.234 ms | 0.273 ms | 1.168× |
| Ubuntu | 3,691-byte medium | 0.375 ms | 0.669 ms | 1.785× |
| Windows | 331-byte small | 0.267 ms | 0.320 ms | 1.200× |
| Windows | 3,691-byte medium | 0.453 ms | 0.825 ms | 1.822× |

Both workloads passed the script's median <=2.5× assertion on both platforms. Transformation yield was nonzero: small `literals=1, properties=1, bindings=2`; medium `literals=33, properties=1, bindings=34`. The exact input/output SHA-256 values are included in the workflow logs.

## Scope caveat

This measures wall-clock `performance.now()` around unique-fragment `data:`-URL dynamic imports (module load/parse/evaluate plus async loader scheduling), not process CPU time or a realistic hot workload. There were large single-sample outliers (medium obfuscated: 4.252 ms Ubuntu and 8.940 ms Windows) despite passing medians. Treat this as a useful paired COO startup smoke test, not proof of a strict compute-time ceiling. A decision-grade budget should specify whether the 2.5× rule applies to median, aggregate, or tail and should report paired CPU-time measurements plus representative workloads.

No production source was changed and no comprehensive acceptance was attempted. Cherry-pick the one test wrapper only if this focused benchmark should remain in the candidate suite.

— Agent 39