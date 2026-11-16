# Source-spelled V8 TypeError operands and eager string rewriting (2026-11-16)

**Status:** intermediate cross-platform compiler semantics regression and bounded repair, not an obfuscation-security finding.

## Reproducible mismatch

The eager string encoder replaced an ordinary computed-property string with a decoded array access. With `strings:true,identifiers:false,properties:false`, it transformed the source expression `state["privateField"]()` into `state[_oa4b758f9070e[0]]()`. Both look up the same field, but on Node 22 an absent field raises a `TypeError` whose `message` incorporates the source spelling of the failed callee.

- Original: `state.privateField is not a function`.
- Generated: `state[_oa4b758f9070e[0]] is not a function`.

The same risk occurs in direct `new`, a failed tagged template, and a nested computed receiver `target[state["privateField"]]();`. The field string is long enough to pass the encoder threshold. These are **observable JavaScript semantics**, even without an explicit call to `Function.prototype.toString`. The pre-existing property renaming proof already guarded this kind of V8 source-spelled failure; string encoding lacked its own analogous check.

The exact emitted COO mismatch and three other independent shapes failed in both OS jobs of [manual transformation run 43968371812](https://github.com/FlareZ123/obfs/actions/runs/43968371812), pinned to `c749e262003bb25a3a8b6dfca9df9cd7bf876578`. The focused `test/source-spelled-operand-errors.test.js` ran **44 tests: 40 passed, 4 failed** on each platform. Because the loop asserts first on COO, that pre-fix run demonstrates COO mismatches; it does not independently enumerate the SNO or SCO failures.

Earlier red runs were inconclusive: one hit an unrelated imported clone observer test before the new step, and a second caught a mistake in the new test's own baseline-message regular expression. Those failures are excluded from the substantive red result.

## Implementation and preserved positive coverage

Commit `9468f289ec245d374d51e62adad361be2a248d3b` modifies `src/strings.js` with a narrowly scoped `mayAppearInFailedOperand` AST check. It follows the literal's ancestor expression chain up to a function boundary and conservatively refuses encoding the literal when a parent expression is a potentially source-spelled failed call, constructor, tagged template, spread, for-of, array destructuring, or delegated yield operand. It does **not** disable string encoding across the whole file.

The same test includes a genuinely encoded successful computed read `state["privateField"]` on an owned record. The expected `metrics.literals=1` and native output equivalence must both pass for COO, SCO and SNO. The negative cases compare exact native and emitted caught `error.message` for all three modes.

At this SHA, [run 43968683734](https://github.com/FlareZ123/obfs/actions/runs/43968683734) passed the focused 44-case V8 source-spelled test and strict JSDoc type checking **on both Ubuntu and Windows**. The **overall workflow failed** later in an unrelated `test/clone-source-esm-graph.test.js` function-free structuredClone positive control expecting a protected property transformation and receiving zero. That is an open shared regression assigned for investigation to Agent 19 via `communications/agent19/2026-11-16T2219Z_agent1_clone-positive-control-red.md`. No complete green run at this exact source revision is claimed here.

## Limits and performance boundary

The guard uses known V8 failed-operand expression shapes and may conservatively decline safe literals, including expressions that never throw at runtime. It does not prove equivalence for every JavaScript engine, all error formulations, all possible source observability, or arbitrary helper mutation. The regression protects exact caught messages in bounded Node 22 fixtures, with a positive transformation control. No universal protected-work fraction, independent deobfuscation resistance or whole-session 2.5× measurement follows from it. The guard adds work at compilation time and emits no extra runtime instructions when it refuses an unsafe literal.

To reproduce locally after installing dependencies, run `node --test test/source-spelled-operand-errors.test.js` and `npm run typecheck`. The manually dispatched `.github/workflows/manual-transform-safety.yml` places the focused test early and is the cross-platform follow-up gate.
