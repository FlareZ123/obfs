# Chromium CDP CPU-budget measurement prototype (2026-11-25)

**Status:** intermediate measurement-method result; not a release or 2.5x acceptance claim.

## Motivation

The existing browser benchmark uses `performance.now()`, which measures elapsed wall time rather than renderer CPU. This prototype tests whether Chrome DevTools Protocol `Performance.getMetrics` deltas provide a more useful browser-side compute measure.

## Method

- Launch headless Chrome through `puppeteer-core`; browser version `Chrome/157.0.8103.78`.
- Use a fresh page for each native/protected sample, enable CDP `Performance`, and measure the script insertion/evaluation interval.
- Record both `ScriptDuration` (renderer JavaScript execution) and `TaskDuration` (renderer main-thread task time) deltas. These are not process-wide CPU measurements.
- Alternate native/protected order across paired samples.
- The workload is a strict CommonJS-style script with a private top-level owner object, a repeated property-read loop, three 100k calls and one 1M call. The COO output uses `closedWorld:true`, `properties:true`, `identifiers:false`, `strings:false`; two properties are rewritten.
- The test compares the numeric result for parity and computes paired median bounds against the 2.5x threshold.

## Observed result

Focused run [45526670103](https://github.com/FlareZ123/obfs/actions/runs/45526670103) passed on Ubuntu and Windows (the browser measurement itself runs on Ubuntu; Windows validates the skip path and JSDoc). Node was `v22.23.4`; Chrome was `157.0.8103.78`. Fifteen paired samples were collected at 1,000,000 hot iterations plus the three 100,000-iteration calls.

| Metric | Native median | COO median | Ratio of medians | Median paired ratio | 95% upper median bound | Decision |
|---|---:|---:|---:|---:|---:|---|
| CDP ScriptDuration | 9.506 ms | 9.177 ms | 0.965x | 0.970x | 1.055x | supported |
| CDP TaskDuration | 12.412 ms | 12.106 ms | 0.975x | 0.968x | 1.032x | supported |

Confidence attained for the paired median bounds was 0.9824. The TaskDuration metric had all 15 observed pairs below 2.5x. ScriptDuration had 14/15 pairs below 2.5x; one pair was 3.43x (native 2.683 ms, protected 9.204 ms), while its median upper bound remained 1.055x. This outlier is retained, not discarded.

Project, external-corpus and paired-budget JSDoc checks passed on both platforms.

## Reproduction

- Branch: `agent9/browser-cpu-cdp-prototype-20261125`
- Test commit: `95750b589a67bd0bc55cf7e3f9919bfb68c6c686`
- Harness: `sims/agent9-browser-cdp-budget.js`
- Focused test: `test/agent9-browser-cdp-budget.test.js`
- Workflow: [45526670103](https://github.com/FlareZ123/obfs/actions/runs/45526670103)

## Interpretation and limits

- CDP `ScriptDuration` and `TaskDuration` are useful renderer-main-thread diagnostics and avoid treating `performance.now()` wall time as CPU. `ScriptDuration` is the closer JavaScript-execution metric; `TaskDuration` includes other main-thread task work.
- The paired median bounds are below 2.5x for this one property-only COO workload. This does **not** prove a worst-case 2.5x ceiling; the ScriptDuration outlier demonstrates why per-sample tails must remain visible.
- This is one synthetic workload, one Chromium version, one platform, and one transform configuration. It does not cover strings, identifier renaming, VM/wasm, multi-file graphs, SCO, SNO, workers, server CPU, browser startup, or full application session lengths.
- The metric deltas do not represent total browser-process CPU or GPU/worker activity. They should be described as renderer main-thread JavaScript/task time.
- A broader acceptance harness needs several independent workload families, more samples, familywise treatment across workloads, cold-start and steady-state reporting, and explicit inclusion/exclusion of initialization for each mode. COO initialization cannot be silently deducted under the project budget rule.
- No production code or workflow was changed. The prototype remains on an isolated research branch.
