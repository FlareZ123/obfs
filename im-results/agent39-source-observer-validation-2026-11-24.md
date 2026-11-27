# Agent 39 — source-observer candidate validation ledger (2026-11-24)

**Classification:** intermediate research and validation evidence. This is not an established result and does not change the repository's `RELEASE-BLOCKED` decision.

## Candidate pin and focused behavior

The candidate branch `agent3/frozen-main-rebase-20261124` remained at `ef457eb1b9c5db41883068fe994b7ffec91a48d1` during this review.

- Focused source-observer workflow [45411591700](https://github.com/FlareZ123/obfs/actions/runs/45411591700): 16/16 tests passed on Ubuntu; the test step also passed on Windows. The focused tests include constructor-chain and `__proto__` mutation, dynamic import, callable writes, mapped ranges, and rollback.
- The candidate's strict JSDoc initially failed on `src/source-observation-plan.js:605` (implicit `any` callback parameter) and `src/strings.js:143` (`syntheticOriginId` missing from the local edit-array type).
- An isolated JSDoc-only patch is available on `agent39/jsdoc-fix-source-observer-20261124`, commits `0e85ad218de38ab3dad92dd6a28010b1c1eee472` and `6ffe8958fcf64cec67b9386c75576f41fcaad377`. It annotates the Acorn array element as `AstNode|null` and types the edits as `SourceEdit[]`. Workflow [45411985754](https://github.com/FlareZ123/obfs/actions/runs/45411985754) completed successfully on Windows and Ubuntu: 16/16 tests, strict project JSDoc, external JSDoc, and paired/complete-suite evaluator JSDoc all passed. No runtime logic changed.

## Confirmed pass-admission gaps

Agent 50 independently reproduced these on candidate `ef457`:

- Workflow [45408740557](https://github.com/FlareZ123/obfs/actions/runs/45408740557), both platforms: the constructor-chain mutations were rejected, but an untagged `throw 0;` inserted at offset zero was accepted by `validatePlanSemantics`.
- Workflow [45410835586](https://github.com/FlareZ123/obfs/actions/runs/45410835586): an untagged replacement of an unprotected literal was admitted, and a structurally copied `SourceEditMap` with an unchanged-only segment hid an appended throw.

These are separate from the repaired constructor-chain issue. The AST-effect scanner is not a general arbitrary-edit semantic validator. The narrow fix is a core-enforced, pass-specific admission contract: unchanged segments allowed; every changed segment must carry the exact origin for the current trusted pass; replacement ranges must match that pass's allowed AST token classes; only the decoder prologue may insert; and copied/forged map objects must not be accepted.

Agent 50's isolated prototype branch `agent50/source-observer-pass-origin-prototype-20261124` had pass-origin tags for property, identifier, and string edits; per-pass allowlists from `core.js`; AST token-class checks; and a process-local WeakSet map brand in follow-up commit `dcd9208ce3eef20733b8ed99d3f9c87cc9414a3e`. Its focused workflow [45410229625](https://github.com/FlareZ123/obfs/actions/runs/45410229625) passed 19/19 tests and strict JSDoc on both platforms. Origin strings are compiler provenance, not cryptographic authentication.

Full manual workflow [45410572601](https://github.com/FlareZ123/obfs/actions/runs/45410572601) on the earlier prototype commit had 12 Ubuntu failures among 5,386 tests (5,349 passed, 25 skipped). Failures included broad property-yield regressions and a selective SCO fixture. The prototype branch was reported 176 commits behind current main, so these failures require a deliberate rebase/base comparison before attributing causality. The prototype is not accepted.

## Budget measurement boundary

Keep elapsed startup latency and CPU compute time separate.

- The Node and browser `performance.now()` measurements are elapsed module-instance startup/evaluation, including loader scheduling. Their >2.5× observations are elapsed-latency outliers, not proof of compute-budget violations.
- A corrected Puppeteer browser harness without virtual-time scheduling achieved roughly 0.1 ms observed timing steps. Current-candidate run [45408942714](https://github.com/FlareZ123/obfs/actions/runs/45408942714) supported the familywise median bounds but had one strict elapsed-sample overage in the medium workload. Browser CPU remains unmeasured.
- Node `process.cpuUsage()` was too coarse/noisy in these experiments. `process.threadCpuUsage()` with 512 fresh imports per paired batch was more stable. Current-candidate validation run [45411166446](https://github.com/FlareZ123/obfs/actions/runs/45411166446) produced familywise median upper bounds below 2.5× on both OSes: Ubuntu small 1.483× / medium 2.046×; Windows small 2.000× / medium 2.376×. However strict CPU sample outliers remained (one Ubuntu pair, four Windows pairs), and Windows placebo controls also had two outliers. Treat this as provisional CPU evidence, not a clean strict receipt.
- Browser compute requires CDP `Performance.getMetrics` / `TaskDuration` or a trace-based measurement; high-resolution `performance.now()` alone is not CPU evidence.

## Recommended continuation

1. Review and integrate pass-origin admission and SourceEditMap branding; retain the untagged throw, untagged literal replacement, and forged-map regressions.
2. Rebase the candidate/prototype onto current main and compare the full-suite failures against the rebased base before assigning causality.
3. Rerun focused tests and the complete cross-platform gate on the exact integrated SHA.
4. Keep CPU compute evidence distinct from elapsed startup latency; obtain browser CPU measurements before claiming the 2.5× compute budget.
5. Keep the primary objective release-blocked until the hostile-runtime and environment-locking objectives have actual evidence.

— Agent 39

## Final status of full run 454126

Run [45412679635](https://github.com/FlareZ123/obfs/actions/runs/45412679635) completed with failure on both Ubuntu and Windows at 14:28:59 UTC.

Both platforms failed the same 12 behavioral/adversarial tests: `bound-runtime-interception` (1), `bound-runtime-minifier-control` (1), `factory-object-flow` (1), `function-declaration-reader-proof` (2), `interfile` (1), COO and SNO `private-class-source-yield` (2), `private-tuple-session` (1), `sco-dense-hybrid-matched-http` (1), `sno-bound-runtime-interception` (1), and `source-stable-bound-export` (1). The Windows failed log confirms these exact 12 cases.

Ubuntu additionally failed step 17, `Real Chromium module and host-lock integration`, with `Chromium budget benchmark failed: <!DOCTYPE html>`. Windows skipped steps 17–19 after its behavioral suite failed. Both platforms passed JSDoc, external/low-rank/budget-evaluator JSDoc, performance sample, six-module startup/session profile, and native/emitted whole-process budget/public-clone steps. Ubuntu passed Chromium steps 18–19.

Conclusion unchanged: pass-origin prototype is not integrated or accepted. Rebase/base comparison is required before attributing the 12 compatibility failures; fix the asynchronous Chromium report capture separately. Do not call this a successful full run.
