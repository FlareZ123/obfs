# Three-module Chromium cold-import control and virtual-time measurement counterexample

**Agent 8, 17 November 2026. Status:** intermediate reproducible benchmark engineering, **not** an established security result, release pass or application-wide performance guarantee. The exact complete application is the previously frozen three-module Node/browser ESM stateful Unicode event processor in `examples/polyvariant-app/native/`.

## Benchmark question and contract

The existing [already-imported browser comparison](../test/polyvariant-app-three-way-browser.js) measures synchronous application work after loading. We created [an independent cold-graph browser experiment](../test/polyvariant-app-cold-browser.js) to capture an additional, separately stated boundary. Its control is the trusted original, candidate is actual COO compiler output, and independent attacker is source-only reconstructed arithmetic code distributed in a complete three-file program. All three execute `runScenario(-817, records, {emit})`, compare exact whole-program JSON and full external host callback traces against the original Node reference, and use identical 1/50/1,000/10,000 Unicode event inputs.

Every trial has a fresh, unique three-file URL graph. A local HTTP server checks all **324** module URLs are requested **exactly once**, and rejects unauthorized URLs. Each variant participates in nine alternating trials per workload, with the corrected six-order Latin-square-plus-reversal schedule covering positions **three times per variant**. A trial's measured `totalMs` begins before a dynamic `import()` and ends after the synchronous full-application call and host callbacks. Its `importMs` and `runMs` components are reported separately. Browser process startup, the entry page load, module/source generation and independent attack construction are excluded. Localhost HTTP is included and has no general WAN/TLS equivalence. The results are paired across three variants by workload and order index; continuous stationary i.i.d. assumptions for confidence bounds require independent scrutiny.

## Measured failure of the first clock instrumentation

At immutable `e199a25c312fedf595df8aa0ab72626ac05a3224`, [run 44089085066](https://github.com/FlareZ123/obfs/actions/runs/44089085066) passed both Ubuntu and Windows Node 22 tests and strict JSDoc checks, and Ubuntu Chromium completed all four output/trace comparisons and 324 HTTP graph requests. The Ubuntu Chrome job was `134059201251`. The page used `performance.now()` under headless Chromium's `--virtual-time-budget=45000` flag.

| Input events | Browser native median total (ms) | COO median total (ms) | COO/native ratio of medians | Native synchronous execution time in all nine trials (ms) |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 30.0 | 30.0 | 1.000 | **0** |
| 50 | 30.0 | 30.0 | 1.000 | **0** |
| 1,000 | 30.0 | 30.0 | 1.000 | **0** |
| 10,000 | 30.0 | 30.0 | 1.000 | **0** |

All measured `runMs` observations across native, emitted and reconstructed variants were **zero**. All `importMs` observations absorbed approximately 30 ms. Full native and emitted business semantics still executed and matched host trace. This demonstrates a **clock-liveness failure for this concrete configuration**: the attractive 1.0× ratios cannot be used to decide the 2.5× budget. The test's initial 'success' status certified output parity, compilation and assertions that were themselves too weak about time advancement. It did not certify a meaningful CPU time measurement. No other experiment is presumed invalid without its own clock check.

The three frozen graph SHA-256 digests were native `42c039f233285da6dc8f837b3ff2aca62ad73b659cc715838c48fc3226cb52a8`, published `6c0fa2b6e1578e9f51b8ffc253a00c69be0fdc9f68e22c15ea28df91fdde52e5`, reconstructed `6dca657d524e3d1ee29b6e91307915fad731d125a96d01de97fa0ba3f05bff31`. The tested browser event output hashes and the entire per-variant timing arrays are preserved in the `POLYVARIANT_COLD_CHROMIUM` line of the immutable Ubuntu CI job log.

## Corrected methodology

The branch `agent8/cold-graph-chromium-20261117` removes `--virtual-time-budget`; uses the ordinary real-time headless `--dump-dom` page capture; awaits the main asynchronous page routine at module top level; adds an independent five-million-iteration synchronous `performance.now()` liveness probe; and refuses any zero-only 10,000-event native runtime sample. Variant ranks are counterbalanced exactly. It reports both per-workload paired slowdown diagnostics and a four-workload Bonferroni familywise median diagnostic using [shared inference infrastructure](../sims/familywise-budget-bound.js). The latter describes median paired ratios under stated sampling assumptions, with observed >2.5× individual pairs separately disclosed. It cannot establish the strict universal 2.5× limit.

**Revised exact head `fd5db284f790162848c7bff2f8a8b8a42066097c` targeted run [44091233847](https://github.com/FlareZ123/obfs/actions/runs/44091233847): status pending at report creation.** A predecessor `3c49b6ec` run [44090457453](https://github.com/FlareZ123/obfs/actions/runs/44090457453) was explicitly cancelled while queued after the counterbalanced ordering patch. No successful corrected timing verdict is claimed until its own logs are inspected.

## Decision boundaries and next experiment

Once a real-clock CI trace passes clock and output controls, compare real cold+runtime ratios with the already-imported warm profile. The next more decisive candidate question adds an **ordinary esbuild-minified fourth graph** (the [four-way source-pinned comparator](../workplace/candidate-over-minification-decision-2026-11-17.md)) on exactly the same original and matched dynamic query attacker. This three-way experiment on its own establishes neither a security advantage over minification nor robustness to instrumentation, tampering or environment forgery. A fake virtual-time 'pass' must be excluded, even though exact application semantics and all JavaScript/Node browser test steps succeeded.


## Subsequent negative gate and explicit completion repair (13:49 UTC)

The first ordinary real-clock attempt [44091233847](https://github.com/FlareZ123/obfs/actions/runs/44091233847) at exact `fd5db284f790162848c7bff2f8a8b8a42066097c` has now completed: **Windows tests/JSDoc pass, Ubuntu fails solely in the new cold Chromium test**. Ubuntu job `134066570449` returned `AssertionError: Browser did not complete cold import experiment`. Its captured `--dump-dom` response still had `<pre id="out">pending</pre>` and the inline module text instead of any measured session data. This is not evidence of behavior mismatch or runtime slowdown. Without virtual-time stepping, the headless CLI serialized the DOM before the page's asynchronous module import finished. Thus removal of virtual time alone cannot establish a valid test.

The subsequent branch replaces the headless CLI dump with pinned `puppeteer-core@25.16.0`, using the installed absolute Chromium executable and `page.waitForFunction` until the browser application explicitly publishes `pass:` or `fail:`. The browser reports Chrome version, and the host reads the JSON output only after that signal. The warm 10,000-event already-imported full-application CPU path is now measured separately, with per-variant output and callback parity checked inside every trial. The localhost cold graph measurement and clock liveness checks remain intact. A new exact-source gate was dispatched as [44096670510](https://github.com/FlareZ123/obfs/actions/runs/44096670510), initially queued at 13:49 UTC. At this report update **no resulting browser performance claim exists**. Prior pinned virtual-time 1.0× ratios remain rejected.
