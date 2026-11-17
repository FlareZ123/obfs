# Recovered strings must be tested against genuinely emitted decoder tables

**Status:** intermediate test-integrity correction, 17 November 2026. **Author:** Agent 10.

## Context and controlled change

A full Linux/Windows validation at `f4adee7b6b285988b2f77332e8ec3d1efa60f74e` ([run 43982671638](https://github.com/FlareZ123/obfs/actions/runs/43982671638)) failed the existing repeated-string recovery positive at `test/static-string-recovery.test.js`: the expected table count was one, but compilation exposed zero recoverable tables. The previous fixture assigned a literal array to a local `values` binding, then called `values.join('::')`. The compiler's source-observation and failed-operand preservation policies may refuse rewriting in otherwise similar programs. The exact reason for the old refusal was not isolated by that failed whole-suite run; do not infer a complete source-observer proof from the test edit alone.

The positive was changed to export the same three-element local array as data, without calling `Array#join`. The two distinct long literals, repeated first literal, fixed compiler seed, independent Acorn-based attacker, and strict native/generated/reconstructed behavioral comparisons remain. `recover()` requires exactly **one** recognized emitted XOR table, at least two rewritten uses, byte-visible recovered string literals, and the three programs to produce equivalent JSON results. An existing separate inline array-callee fixture continues to check **zero** encoded literals and zero recovered tables for that deliberately refused case. This isolates a real encoded-work positive from a deliberate no-op control.

## Pinned validation

- Compiler/test correction: [`f63b3dd1`](https://github.com/FlareZ123/obfs/commit/f63b3dd1e5bb53cbe96f1f95b0616fab86af4dd8).
- Added the static string-recovery test to the existing manual cross-platform attacker normalizer gate: [`67a63b69`](https://github.com/FlareZ123/obfs/commit/67a63b69f62666f679f1ebc4d9cc80f50abbe24e).
- [Exact-SHA manual run 43998607148](https://github.com/FlareZ123/obfs/actions/runs/43998607148) **succeeded on Ubuntu and Windows**, including the independent public-source token normalizer tests, `node --test test/static-string-recovery.test.js`, both strict JSDoc checks, and the untouched existing attack implementation.
- The tests prove recovery only for recognized emitted XOR tables in these fixtures. They do **not** recover arbitrary code or prove runtime security, original-name recovery, or a general 2.5× runtime bound.

**Decision rule:** when compiler guard changes cause a source-only attacker test to find no transformed protected work, report a **transformation-coverage change** separately from genuine attacker reconstruction success or failure. Keep at least one generated-and-recognized positive in the attack harness.


## Additional direct eligibility matrix (17 November, 01:56 UTC)

A separate [six-fixture differential program](../sims/string-eligibility-matrix.js) was run on unchanged compiler inputs, with the independent static attacker and original/generated/recovered CommonJS execution for each case. The exact [Ubuntu/Windows run 43999219908](https://github.com/FlareZ123/obfs/actions/runs/43999219908) passed at `df43286330e74c2476c2035049dbddb3a2f5cd4c`, including both JSDoc checks. The Ubuntu log recorded:

| Source idiom | Source observer | Encoded literals | Recovered tables / replacement uses |
|---|---:|---:|---:|
| Export the local literal array | false | 3 | 1 / 3 |
| Local array `values.join('::')` | false | 3 | 1 / 3 |
| Read a local `values[0]` | false | 3 | 1 / 3 |
| `values[0]+'::'+values[1]` | true | 0 | 0 / 0 |
| Inline literal array `[...].join('::')` | false | 0 | 0 / 0 |
| Detached `Array.prototype.join.call(values,'::')` | false | 3 | 1 / 3 |

Every original/generated/recovered execution agreed in this finite matrix. **Correction to the tentative motivation:** the current compiler *does* encode the original local-array `.join()` idiom. Thus the older whole-suite test's zero-table failure cannot be attributed to local `.join()` by itself, and might reflect a previous revision or separate influence. The revised array-data positive is valid and robust, but this matrix does not establish that its simplification repaired an actual current compiler defect. The inline-callee zero is a distinct, independently verified source-spelling guard; the string-addition zero is a separate syntactic primitive-provenance refusal. Any source-observation fix requires its own hostile negative control and a pinned paired test, rather than inferring cause from the prior full-suite failure.
