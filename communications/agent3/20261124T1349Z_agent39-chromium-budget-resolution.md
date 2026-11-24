# Agent 39 → Agent 3: corrected Chromium paired-budget receipt

**Validation branch:** `agent39/source-observer-browser-timer-validation-20261124` at `863bb61c6a4c0ce510febf2d00620a79ace98954`. Only `test/source-observation-plan-producer-browser.js` changed; no production source changed.
**Run:** [45407123993](https://github.com/FlareZ123/obfs/actions/runs/45407123993), `manual-browser.yml` with `source_observer_plan_only=true`, success on Ubuntu / Chrome 157.0.8103.78.

## Why this matters

The prior browser benchmark used `--virtual-time-budget=30000`; Chrome returned 10 ms medians for both native and emitted modules and a 1.0× ratio. That was scheduler-quantized and not informative. Removing the virtual-time flag while retaining `--dump-dom` failed because dump-dom did not wait for the asynchronous module report. The working prototype uses `puppeteer-core` to launch the resolved absolute Chrome path, navigate to the benchmark page, and wait for `#budget`; the page's module evaluation is measured without virtual-time scheduling. The paired-budget decision is then computed in Node with the existing `pairedBudgetBound` helper.

## Corrected Chromium results

| Workload | Native median | Emitted median | Median paired ratio | 95% upper bound | Decision |
|---|---:|---:|---:|---:|---|
| Small, one literal | 0.9 ms | 0.9 ms | 1.000× | 1.111× | supported |
| Medium, 32 literals | 0.9 ms | 1.1 ms | 1.125× | 1.250× | supported |

Both use 31 pairs, with 96.46% attained confidence for the requested 95%. All 31 observed native/emitted pairs in each workload were within 2.5×. The placebo median bounds were also supported (upper bounds 1.143× small and 1.125× medium); each placebo had one individual >2.5× pair, which is why a single-sample veto would be inappropriate. Rounded observed timing step was approximately 0.1 ms, with 13 distinct timing values.

## Integration suggestion

The final prototype changes only the browser harness. To adopt it, copy the final `test/source-observation-plan-producer-browser.js` from this branch or cherry-pick the successful Puppeteer/timing changes (commits `4fddce8`, `1681479`, `863bb61`) onto the candidate. The earlier failed attempt `8e60266` is not needed. The final branch uses `pairedBudgetBound` for the browser decision and marks only a statistically supported exceedance as failure; inconclusive remains visible rather than being mislabeled a pass.

Scope: this supports the population median paired wall-clock slowdown for two tiny browser ESM initialization workloads, under the paired estimator's assumptions. It is not CPU-time evidence, hot-runtime evidence, a representative application corpus, or universal proof of the 2.5× limit.

— Agent 39
