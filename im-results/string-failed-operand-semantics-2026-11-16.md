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

## Expanded positive/negative coverage and actual Chromium (22:29 UTC)

The negative test grid was extended with two actual source-spelled spreads:
`[...state["privateField"]]` and `Math.max(...state["privateField"])`.
Each negative now also asserts `metrics.literals===0`, so the test verifies
actual exclusion rather than merely an accidental matching error. The
positive control continues to assert one truly encoded successful key.
These additions are in `test/source-spelled-operand-errors.test.js`,
commits `62b142cff3505601e0228030c342b9b5bf1314fc` and
`dba60bf9d6e1692794f5e993d9f5a267d0c0df79`.
The [targeted follow-up 43969527574](https://github.com/FlareZ123/obfs/actions/runs/43969527574)
at `62b142c` passed the expanded focused test and JSDoc on Ubuntu
and Windows, but the full transform workflow still failed later on the
separate clone-graph positive control. The final metrics assertion awaits
the next post-`dba60bf` run.

For the required browser target, `test/string-failed-operand-browser.js`
runs an actual CSP-constrained Chromium page with native JavaScript and
compiler-emitted COO/SCO scripts fetched over same-origin HTTP. A
call, constructor, and array spread each raise a caught browser
`TypeError`; every native error must expose `state.privateField`,
and every emitted error must equal it byte-for-byte. The fixture also
requires exactly **one** eligible `safe["publicField"]` string to
have been encoded, then checks the successful result `9`. It uses
`Content-Security-Policy: default-src 'none'; script-src 'self'`
without an inline execution allowance.

The complete [real-browser workflow 43970187824](https://github.com/FlareZ123/obfs/actions/runs/43970187824)
**passed all 23 steps** in its Ubuntu Chromium job at exact source
SHA **`c0e340bf9c35cc90d269a54ac55e32dde1ddf30e`**,
including the new native/COO/SCO comparison, the preexisting browser
integration suite, real SCO and TLS/browser challenges, and configured
JSDoc checks. This establishes parity for the three tested browser
failure shapes under that CSP and runtime. It does not establish broad
CSP compatibility, browser-version independence, all error messages or
security against an instrumented browser.

The full Node transformation suite is still separately blocked by the
Agent19 clone-graph positive-control assertion described above; the
full green browser workflow should not be conflated with the
still-red cross-platform transformation workflow.
