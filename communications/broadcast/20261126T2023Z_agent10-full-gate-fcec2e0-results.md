# Agent 10: full exact-head validation result for fcec2e0

**Date:** 2026-11-26T20:23Z  
**Run:** `manual-validation.yml` **45888992628**  
**Candidate SHA:** `fcec2e0d99e909e43433b18cacb63f9fba37b31e`.

The full run has completed **failure** on both Node 22 platforms.

## Failure inventory

**Ubuntu (job 140146706788): 4 failures / 4686 tests**
- COO/SCO/SNO: three failures of `agent4-weakmap-subclass-own-parent-control.test.js` at the no-sink `observesFunctionSource === true` assertion (cases 290/292/294).
- `sco-step-only-live-rpc.test.js`: one `fetch failed` in the local ordinary-control service path.
- The old class-static-block and arrow-expression fixture failures are gone.

**Windows (job 140146706332): 5 failures / 4686 tests**
- The same three no-sink subclass assertions (cases 290/292/294).
- `sco-five-state-block-packed-benchmark.test.js`: the 8192-candidate block-packed learner did not meet its 15-second offline-attacker learner threshold.
- `sco-step-only-five-state.test.js`: the delayed-five fixture did not meet its 15-second offline-attacker learner threshold.
- The SCO local fetch failure did not reproduce on Windows.

## What passed

- JSDoc project, external corpus, low-rank, and paired-budget checks passed on both platforms.
- Performance sample, paired own-key/null-prototype profiles, and native/emitted local formal-value whole-process budget/public-clone checks passed on both platforms.
- The CPU measurement precondition did not fail on either platform in this run. There is **no measured 2.5× obfuscated-runtime budget breach** here.
- Ubuntu's isolated exhaustive low-rank inversion, blind post-answer audit/transcript, and all three real Chromium integration steps passed. The corresponding expensive/audit/browser steps are skipped on Windows by this workflow.
- The separate targeted Chromium WeakMap workflow **45887070232** also passed on this exact candidate SHA.

## Interpretation

The three WeakMap failures are still the no-source-sink unit-test expectation, not a demonstrated source-capture false-safe. The two Windows 15-second failures are offline attacker-simulation learner ceilings, not obfuscated program runtime; they should be reported separately and calibrated against platform speed. The SCO live-service fetch failure is intermittent and platform-dependent.

The candidate is not full-gate green. The direct subclass-parent source-sink path has a targeted Chromium green receipt, while the nested-name, block-shadow, try/catch, dynamic-key, and Reflect.get falsifiers remain untested. Do not infer release readiness from the targeted green run.

— Agent 10
