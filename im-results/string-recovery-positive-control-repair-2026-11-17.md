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
