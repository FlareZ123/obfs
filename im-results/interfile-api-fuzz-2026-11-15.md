# 120 generated native ESM graphs: external API and reflection compatibility

**Status:** intermediate test-evidence, not a proof of complete interprocedural property-renaming soundness. Agent 12, 2026-11-15.

## Objective and method

The obfuscator must retain exact JavaScript behavior while renaming private object properties only when every relevant cross-file use can be updated. A particularly dangerous boundary is a property consumed through a host-provided API, dynamic key or reflected object shape. Current tests cover several hand-written four-file cases; this study adds a generated set of 120 **distinct source graphs** under the real Node.js ESM loader.

Generator: `sims/interfile-api-fuzz.js`; automated test `test/interfile-api-fuzz.test.js`; included in existing manual-only `.github/workflows/manual-transform-safety.yml`. Twenty deterministic seeds produce distinct field names, numeric values, and two-key object literals, each in six graph architectures. Every case contains `state.mjs`, `bridge.mjs`, `entry.mjs`, and, where needed, `api.mjs` that prepares `globalThis.window.api`. An original and an obfuscated copy of every complete graph are written atomically to separate temporary directories and imported through two fresh child Node processes. The runner compares the full JSON values under native ESM evaluation.

The compiler uses COO, `closedWorld:true`, explicit deterministic seed, and disables string and identifier passes to isolate property-flow proof. It does **not** claim arbitrary dynamic import or browser DOM semantics, and it does not pre-approve any third-party API object shape.

## Generated case matrix

| Shape | Graphs | Expected cross-file property rewrites | Why |
|---|---:|---:|---|
| Direct static `state.privateField + state.auxiliaryField` | 20 | At least 2 per graph | Every use is statically known and captured inside supplied module graph |
| `state[globalThis.window.api.key]` | 20 | 0 | External mutable computed key can access an original name |
| `JSON.stringify(state)` | 20 | 0 | Serialized own property names are observable |
| `Reflect.ownKeys(state)` | 20 | 0 | Reflected field spellings are observable |
| `window.api.read(state)` | 20 | 0 | Object escapes to an external API with access to an unchanged field name |
| Computed `const key = 'originalName'; state[key]` | 20 | 0 | This compiler does not prove all aliases through identifier keys |

Total: **120 graphs, 20 positive, 100 negative**. Exactly 120 native output comparisons passed. The positive graphs establish **at least 40** actually eligible cross-file property rewrites (the two own keys in each positive graph). Every negative graph emitted zero cross-file property rewrites. All original-versus-obfuscated ESM outputs matched exactly.

Pinned manual-only cross-platform run: [#43699296194](https://github.com/FlareZ123/obfs/actions/runs/43699296194), source commit `3e77015e7b0a94d8c579549e43ddabfbf1109ed6`. On both Ubuntu and Windows Node.js 22, the focused suite passed **82/82 test cases**, including the 120-graph subtest, and strict JSDoc type checking passed. The test intentionally uses a single native ESM loader process per group to keep 120 cases operationally affordable.

## Interpretation

The current conservative cross-module property proof accepts this positive restricted pattern and rejects all observed external-API/reflection patterns under the tested conditions. The behavior matches the requested fail-closed principle. This result is reproducible **compatibility evidence**, with limited negative coverage: dynamic scope, import aliases, runtime monkey patching, inherited getters, getters/setters, same-name shadowing and many other host semantics are not exhaustively generated here.

A zero property count in the 100 negative cases also shows why a raw transformed-byte count is a poor quality measure without semantic provenance. Future coverage optimizations should preserve these witnesses, prove transformed ownership before property changes, and measure exact retained behavior on additional independent graphs rather than treating the observed conservative refusal as unnecessary.

## Security and performance

This test measures **compatibility and transformation eligibility only**. It does not establish resistance to static normalization, dynamic extraction, tamper bypass or domain lock evasion. Timed throughput and whole-program 2.5× runtime overhead were not measured here. The test's key contribution is 120 reproducible graph-level semantic checks with independent code paths at the external API boundary.
