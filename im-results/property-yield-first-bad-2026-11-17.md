# Source-pinned historical isolation of four cross-file protection-yield regressions

**Agent:** 29. **Date:** 2026-11-17. **Classification:** Intermediate build-regression forensics and semantic-analysis hypothesis; *no* new obfuscation security claim.

## Why this investigation was necessary

The complete [manual validation run 44139327279](https://github.com/FlareZ123/obfs/actions/runs/44139327279) at `f377fd52154d71a8bf0042a6e526a4c900701f3e` failed four positive cross-file private-property-renaming tests with 0 renamed fields where 1 or 2 were expected. The SCO catch/stack tests newly introduced in that exact SHA passed, and both strict JSDoc checkers passed. An older full validation [44118786016](https://github.com/FlareZ123/obfs/actions/runs/44118786016) at `7872c87deab926e7e41ee6e20e41da9209e8a14b`, dispatched 2026-11-17 15:49 UTC, already failed all four. Thus the regression predates the Agent29 SCO changes.

A previously [fully passing Linux/Windows Node22 and Chromium validation 43961051109](https://github.com/FlareZ123/obfs/actions/runs/43961051109) at `87c8126e2185c01204c63f32f74ca69d50dae50d` on 2026-11-16 21:37 UTC provided a known-good source revision with the same checked-in tests.

## Reproducible first-bad diagnosis

One fresh Ubuntu Node22 Actions workflow installed project dependencies and ran `git bisect` on the frozen previous-good/known-bad interval using the *actual checked-in test files*; no fixture, expected count, or compiler logic was changed. The test-only command for the reader was `node --test --test-name-pattern="closed-world ESM imported reader is safe across multiple consumers" test/cross-file-reader-flow.test.js`; the other three cases executed their entire single-test files. Each probe returned a nonzero process exit if the test's protected-field count was 0. The first run [44142502974](https://github.com/FlareZ123/obfs/actions/runs/44142502974) identified the reader failure. A second [run 44142888208](https://github.com/FlareZ123/obfs/actions/runs/44142888208) independently repeated that path and bisected the other three positive tests in the same Ubuntu Node22 job. Both workflows **completed successfully** as bisect harnesses, while recording the expected deliberately failing intermediate commits.

| Positive protected-work test | First bad reachable commit in selected interval | Change |
| --- | --- | --- |
| `closed-world ESM imported reader is safe across multiple consumers` | `729143ea37a19aa9af3e92cd86e2bf467acac538` | Agent50 native console inspection of function names |
| `application-challenge-null-prototype-yield` | `1c504ad1d01ec43dcb581d2cfaea3967d5b62973` | Agent3 JSON.parse coercion/source observation |
| `application-challenge-token-neutralize` | `1c504ad1d01ec43dcb581d2cfaea3967d5b62973` | Same JSON.parse change |
| `ownkey-comment-static-recovery` | `1c504ad1d01ec43dcb581d2cfaea3967d5b62973` | Same JSON.parse change |

The precise cause was determined by reading each actual commit diff:

1. `729143ea` added a `containsConsoleFunction` check to `observesFunctionSource`. The positive three-module fixture's `other.mjs` declares `export const answer=peek(state)`, with `state={secretField:23}` and pure `peek(x){return x.secretField;}`, and `main.mjs` passes imported `answer` to `console.log`. The isolated source observer sees an opaque imported identifier and cannot prove `answer` numeric; it may therefore suspect function-name source disclosure. A known-function `console.log(function)` really can reveal names, so reverting the native observer without a proof would be unsound.
2. `1c504ad1` recognized `JSON.parse`, its aliases and bound calls as implicit ToString observers. The six-module application entry contains `const cases=JSON.parse(process.argv[2]||'[[1,1000]]');`. A normal Node startup supplies string process arguments, but `process.argv[2]` is a mutable host-owned member and can be overwritten with a function by prior code or an executable preloader. In that case a JSON parsing error can reveal the function's source. Without a closed-world/host provenance proof or a restricted external contract, treating the operand as always a string would be unsound.

In short, three apparently separate test failures have a single historical trigger, and the fourth has another. Their **observed mechanism** is a conservative early whole-graph source-observer gate returning `{files,objects:0,properties:0}`; this diagnosis is supported by first-bad transitions and source review, but no detailed line-by-line dataflow trace from the running compiler was emitted. The guards may be behaviorally justified for hostile host states, so these are protection-coverage regressions rather than automatically proven correctness bugs.

## Correct next decision

Preserve the red/green negative source-observation tests, and develop a bounded, explicit primitive-origin proof or host-input type contract before re-enabling private-property renaming. For the reader fixture this could prove the exact imported expression `peek(state)` scalar under owned data-only records and all callers; for the six-module app this requires clarifying whether an external process argv cell may be overwritten before entry. The compiler should not silently assume arbitrary host-owned external inputs are immutable primitives. Compare positive transformed-work count alongside genuine native/emitted behavior and hostile mutations to avoid vacuous claims.

Until a proof-controlled fix lands, the affected frozen six-module *modified* COO variants that once had 2/2 transformed fields now emit 0/2 at the tested mainline heads. A public-only offline clone of completely unmodified output says little about the efficacy of an obfuscator. The project-wide green full-validation pin remains 2026-11-16 21:37; post-pin targeted green SCO or semantics jobs do not establish a whole-repository release.

The two temporary manual historical-bisect workflow definitions were execution vehicles, not new reusable infrastructure. The immutable logs are linked above; retire the temporary workflow after preserving this diagnosis. This report belongs in `im-results/` because it resolves a build-forensics question, not a security-performance candidate.
