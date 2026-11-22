# Host-observed Promise continuation source: two-platform red/green

**Agent:** 12. **Date:** 22 November 2026. **Classification:** intermediate compatibility result and opt-in integration candidate, not a security advance.

## Boundary and cause

The strict 1:1 observable-source contract covers a host's inspection of callback `Function.prototype.toString()`. A host may replace the ambient `Promise.prototype.then`, `catch`, or `finally` before the compiled program runs. The replacement can inspect a supplied callback and forward the call to the original native method without changing ordinary results.

The experimental Agent 3 integration parent `ddb9ccc53dd6fd868122efd332c18c395768b1f5` treated inline callbacks of verified `Promise.resolve(...)` continuation chains as private direct-callables in `src/properties.js::collectPrivateDirectCallables`. That conclusion assumes the host's method has native behavior. Under a preloaded observer, the callback's own exact source is public. A private property rewrite inside the callback changes an externally observed result.

## Source-pinned red

[Ubuntu and Windows focused run 44992851896](https://github.com/FlareZ123/obfs/actions/runs/44992851896), exact branch source `7208ae51165032cf6b8eb80f9b028ac0aaee50dc`, runs `test/promise-then-source-preloader-review.test.js` with actual Node 22.23.4. Each OS reports **2 passes, 3 failures** in the five-test first witness. The same input has native callback source:

```js
()=>owner.secretField+independentValue
```

The compiled callback is instead `()=>owner._p...+independentValue` in each of COO, SNO and SCO. Ordinary callback output remains 21. The test independently establishes a positive private-field rewrite candidate. This is a test against `obfuscateFiles` commonjs source executed inside a Node `vm` realm, not a real HTTP SCO partition or a browser engine.

## Source-pinned green prototype

[Ubuntu and Windows focused run 44993094514](https://github.com/FlareZ123/obfs/actions/runs/44993094514), exact source `37c70ef27786d863476c66c2765f1a8e0b17c7a0`, runs an expanded **13/13 passing** matrix on both OSes, followed by passing strict project and external JSDoc gates. The fix branch [`agent12/promise-then-source-fix-20261122`](https://github.com/FlareZ123/obfs/tree/agent12/promise-then-source-fix-20261122) removes the assumption that callbacks of ambient Promise methods are private and retains the existing direct-invoked function exception. It changes `src/properties.js` and carries the new regression. It does not edit or merge into the canonical Agent 3 branch.

The expanded matrix covers each of `then`, `catch`, and `finally` in COO, SNO and SCO plus three native host controls and one independent positive control. Each transformed fixture retains exactly **one** genuinely renamed, unrelated private own key while preserving exact callback source spelling and ordinary outputs. The catch fixture uses a rejected native Promise without constructing an `Error` object to avoid activating an unrelated conservative stack-source observer guard.

An earlier intermediate expansion at `21456c142481ef103464d45a4def243b10e84fda` had 10 passes/3 failures because its catch fixture constructed an `Error` and the compiler conservatively declined *all* property renaming. This was an overstrict positive-yield test fixture, not an observed source-parity failure; the following source pin separated the concerns.

## Limits and integration decision

This patch provides a narrow **compatibility** remedy for an ambient-host preloader. No browser-target execution, independent source reconstruction resistance, authorization improvement, arbitrary cross-file proof, or 2.5x compute guarantee follows. It does not fix all public-callable exposure issues in the experimental integration branch. The mainline and primary strong-protection release decisions remain unchanged.

The designated integration owner (Agent 3) should evaluate this exact patch on its canonical parent with other property, identifier, string, and source-observation tests. Freeze one combined source and run the full Node/Chromium gate only after focused tests are green. The red branch [`agent12/promise-then-source-review-20261122`](https://github.com/FlareZ123/obfs/tree/agent12/promise-then-source-review-20261122) remains a reproducible falsification source.

## Reproduction

Using the existing `.github/workflows/manual-validation.yml`, dispatch `focused_test=test/promise-then-source-preloader-review.test.js` on either exact branch. The focused job invokes the repository's `sims/focused-test-dispatch.js`, runs the named test on Ubuntu and Windows, and then runs the strict JSDoc gates when tests pass. Node 22.23.4 and the two exact source SHAs above pin the results. The CI runner and dependency package environment are external and are not frozen as a byte-reproducible build.

## Combined-pass cross-check (later pinned source)

The independent follow-up [two-platform run 44993406736](https://github.com/FlareZ123/obfs/actions/runs/44993406736) at exact source `d527f5fc3cdeb6b32054a39e41c552e07829a505` extended the same focused test to **16/16 passing tests per OS** with both strict JSDoc gates green. Its three new tests enable `properties:true`, `identifiers:true`, and `strings:true` simultaneously with a host-installed `Promise.prototype.then` source recorder. On **each** of COO, SNO and SCO, the compiler emitted `{literals:1,objects:1,properties:1,bindings:2}` transformations while preserving callback `Function#toString` and return value exactly. This establishes narrow simultaneous-pass coverage, not full cross-file or browser certification.

The latest candidate branch head is `d527f5fc3cdeb6b32054a39e41c552e07829a505`. The earlier 13/13 source pin remains independently reproducible and still isolates the direct property renaming correction.
