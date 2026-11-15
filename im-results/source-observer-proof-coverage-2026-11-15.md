# Closed-world source observation: repaired alias/coercion regressions and measured collateral refusal

Date: 2026-11-15. Researcher: Agent 12. **Status: reproduced engineering evidence and semantic regression repair, not a general JavaScript source-observation theorem.**

## Reproduced failing baseline

The manual cross-platform full validation [#43695839545](https://github.com/FlareZ123/obfs/actions/runs/43695839545) at source commit `8ab554d7bb612bb3cc07d8f710ce0783b2ebe9ce` passed 607/613 on Ubuntu (one skip) and 608/613 on Windows. Five pre-existing source-introspection cases failed identically on both OSes:

| Failing test | Failure mode |
|---|---|
| 58, BigInt guard | Direct `BigInt(fn)` and `BigInt.asIntN(bits,fn)` may stringify the function into a conversion error, but the detector did not recognize BigInt |
| 90, computed local function member | `const key='toString'; fn[key]()` could observe rewritten function-source spelling |
| 91, computed Reflect key | `Reflect.get(Object.getPrototypeOf(()=>{}),key)` with a constant alias could retrieve the inherited native source method |
| 403, SCO cross-file member | The same constant key in a separately served ESM importer could see a rewritten exporter |
| 404, SCO cross-file Reflect | The same Reflect key in a separately served importer could see a rewritten exporter |

These are correctness failures for observable native source text. Preserving only the function's numeric result is insufficient.

## Repair and validation

Commit [`998c00bb`](https://github.com/FlareZ123/obfs/commit/998c00bb421a2bcf347b5d5daa66fd56cf9b612d) modifies `src/ast.js::observesFunctionSource`:

1. A `sourceStringKey` resolver follows uniquely declared `const` bindings through static string expressions, including finite string addition, for computed property and reflection keys. If the key is not provable and the receiver is a tracked function, the guard conservatively declines mutation.
2. BigInt joins the recognized coercion constructors, with `asIntN` and `asUintN` checking the second runtime argument. Literal primitive arguments remain a negative control rather than triggering a blanket ban.
3. The existing file-group gates in `src/core.js` and `src/sco.js` reuse the improved detector; no new client execution or decoder code is added.

**Cross-platform validation:** manual full [run #43696715738](https://github.com/FlareZ123/obfs/actions/runs/43696715738), pinned to the repair commit, passed on **Ubuntu and Windows Node.js 22**, including all behavior/adversarial tests, JSDoc typechecks, sampled benchmarks and Ubuntu live Chromium integration. This is an actual green integration checkpoint following the five specific red cases, subject to subsequent source commits receiving their own validation.

## Coverage tradeoff on the same native ESM corpus

The independent fixture `sims/source-observer-coverage.js` uses a three-file Node ESM graph with two own-property keys, two exported functions, static imports, and real runtime execution. It compares the same source with and without an imported function's `toString` observation. A third, hand-segregated control transforms only the unrelated module while retaining the observed function's module verbatim.

| Fixture / compile path | Eligible property rewrites | Native ESM output |
|---|---|---|
| Original graph with no source observer, closed-world COO | **at least 2** (asserted lower bound) | Equal to native |
| Same graph with source observer, current whole-group guard | **0** (asserted exact) | Equal to native |
| Observed graph, fixture-specific manual isolation of independent module | **at least 1** (asserted lower bound) | Equal to native |

Those are conservative test assertions rather than an unreported exact count. The metrics and source are inspectable in `sims/source-observer-coverage.js`; the native ESM proof and counts are checked by `test/source-observer-coverage.test.js`. Manual-focused workflow [#43696561203](https://github.com/FlareZ123/obfs/actions/runs/43696561203) passed on Ubuntu and Windows at head `1177f496`. The initial fixture with function-local objects failed the positive coverage threshold in [#43696365578](https://github.com/FlareZ123/obfs/actions/runs/43696365578); its corrected version places independent private values outside the exported function bodies and retains real ESM differential checks.

The isolation control is **not** a proposed automatic compiler optimization. A production pass would need explicit file graph and function provenance proof, dynamic loader constraints, all consumers, reflection, aliases and external entry points before selectively permitting mutation. Hand segregation only demonstrates a measurable potential coverage gain in this known fixture.

### Exact graph-coverage metrics reproduced cross-platform

The previous bounds were sharpened with a directly logged `node sims/source-observer-coverage.js` workflow step. Manual [CI #43700585812](https://github.com/FlareZ123/obfs/actions/runs/43700585812), pinned at `4635b1391f7476f311194120c2bc4a69c872e119`, passed **Ubuntu and Windows** focused semantics and JSDoc. Both OS logs report identical metrics:

| Path | Local properties | Cross-file properties | Total properties |
|---|---:|---:|---:|
| Graph without source observation | **2** | 0 | **2** |
| Graph with native `watched.toString()` observation | **0** | 0 | **0** |
| Known-independent module transformed in isolation | **1** | 0 | **1** |

All three native ESM executions preserved output exactly. This is one deliberately small graph whose only property transformations are local; it does not quantify a typical distribution of real-world module workloads or mean that a general compiler should split graphs without proving observational independence.

## Security meaning and open questions

The repair improves semantic preservation against five previously failing known observers. It does **not** demonstrate resistance to static normalization, runtime extraction, hostile debugger instrumentation, or server-owner tampering. The full observer detector remains syntactic and incomplete for arbitrary dynamic scope and host reflection. Unknown receiver types, shadowed computed keys, and indirect native intrinsics remain relevant avenues for adversarial tests.

The group-wide opt-out is conservative and can be expensive in eligible transformations. Any future locality optimization should report the count of safely recovered properties on the same independent corpus, retained red tests and new differential witnesses. The whole-application 2.5× performance rule is not proved by these validation runs.
