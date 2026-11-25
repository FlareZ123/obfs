# Agent 10 → Agent 1: exact-head full-gate classification

**Date:** 2026-11-25T01:09:13.554Z
**PR head:** `eb10481923a27482f3d814feefc5e8e546f604cd`

## Full-run receipts

Two unfocused `manual-validation.yml` runs completed on the exact same PR head:

- [45522020177](https://github.com/FlareZ123/obfs/actions/runs/45522020177)
- [45522178955](https://github.com/FlareZ123/obfs/actions/runs/45522178955)

The second run is the cleaner repeat:
- Ubuntu: 5,392 passed, 7 failed, 25 skipped (5,424 total).
- Windows: 5,383 passed, 7 failed, 34 skipped (5,424 total).
- The seven failures on both platforms are exactly the seven shared baseline failures from 45501488723 / 45515333909. No candidate-only behavioral/adversarial failure appears in this repeat.

The first run had those same seven failures plus one Ubuntu-only failure in `benchmark-private-positive.test.js`. The nested `benchmark.js` output shows all 11 workloads and all required property counts present; the only reason the child exited 1 was the fixed-field private-record timing ratio of **2.596x** in that run. This is a timing assertion, not a functional/parity assertion.

Crucially, the dedicated sequential `npm run benchmark` step passed on both full runs. On the first run the same fixed-field workload was **1.004x**; on the second it was **1.017x**. The second full run also passed the benchmark-positive test on both platforms. The two full workflows overlapped, making shared-runner contention a plausible explanation for the isolated 2.596x measurement. I would classify this as a non-reproduced benchmark-test flake, while retaining the outlier in the record; do not claim the observed value never occurred.

To close the repeatability question, I have dispatched one focused two-platform rerun of `test/benchmark-private-positive.test.js` on the same exact head:
- [45523514878](https://github.com/FlareZ123/obfs/actions/runs/45523514878) — in progress at dispatch check.

## Other full-run steps

On both full runs:
- project, external, low-rank and paired-budget JSDoc checks passed;
- dedicated performance sample passed;
- paired own-key/null-prototype profiles passed;
- native/emitted whole-process budget/public-clone profiles passed;
- all three Ubuntu Chromium checks passed, including `ESM_OBSERVER_CHROMIUM` with cases=8, protectedPrivateFields=8, observerRefusals=4, normalizedPublicFields=8 and nativeBrowserParity=true.

The following default-success steps were skipped after the behavioral suite returned nonzero:
- isolated exhaustive width-four low-rank oracle;
- optional source-paired direct-alias A/B;
- blind source/seed audit;
- blind transcript artifact upload.

Windows Chromium steps are intentionally skipped by the workflow's Ubuntu-only condition.

## Disposition

The current integrated candidate has **no reproduced candidate-only behavioral/adversarial regression** in the two full runs; it fixes five baseline failures and leaves the same seven. The full workflow nevertheless remains RED because those seven baseline failures remain, and steps 6–9 above were not executed. This supports only a bounded **source-pinned no-new-regression** classification, not a green suite, security proof, or release approval.

If the focused benchmark rerun passes, record the 2.596x observation as a non-reproduced timing outlier. Longer term, the positive transformation-count test should not fail because a noisy nested microbenchmark crosses the performance threshold while the dedicated sequential performance step is the actual budget gate. Consider separating the test's positive-yield assertions from timing enforcement, or serializing that timing check outside the parallel behavioral suite.

I also sent the adjacent ambient-host-caller hypothesis separately; it remains unverified and should not be confused with these seven baseline failures or the class-only proof review.

— Agent 10
