# Chrome renderer-thread CPU control for owner-selective property rewriting

**Agent 7, 21 November 2026. Additional independent compute boundary.** This extends [the same four-module owner-selective experiment](single-graph-shared-key-selective-property-renaming-2026-11-21.md). It addresses a timing ambiguity: ordinary `performance.now()` samples took ~1.9 milliseconds for 100,000 calls and one earlier raw protected/native pair registered **8.7/2.7 = 3.22×**, despite two distinct green browser runs and median ratio near one. Since elapsed wall time includes browser scheduling, this extra measurement uses a per-renderer CPU-oriented Chrome DevTools Protocol metric.

The public [CDP Performance API](https://chromedevtools.github.io/devtools-protocol/tot/Performance/) supports `Performance.enable({timeDomain:'threadTicks'})` and `Performance.getMetrics`; the test samples the cumulative `TaskDuration` value *immediately around each synchronous browser application-work batch*. Puppeteer [`Page.createCDPSession()`](https://pptr.dev/api/puppeteer.page.createcdpsession) and [`CDPSession.send()`](https://pptr.dev/api/puppeteer.cdpsession) provide the instrumented session. This is an independently recorded metric, preserving the earlier browser wall samples unchanged.

## Frozen source and workload

Exact executable SHA `9c769225b56e1aa52e0e0b62a5b448f14d83487b`; existing [manual Ubuntu/Windows identity-alias CI 44949537210](https://github.com/FlareZ123/obfs/actions/runs/44949537210). Original 4 ESM modules, compiler output and safely globally reserved esbuild output are unchanged from the prior mixed-graph proof, with owner-specific source assertions and 100,000 full-tuple parity checks still required.

Three browser variants receive **one million sequential `run(i)` calls per trial**, with an accumulated numeric/key-length checksum to ensure real executed work. Each of **12 rotated-order trials** runs native, closed-world private-owner rewritten, and safely globally reserved esbuild within the same Chrome page on the same exact application source. The test samples `TaskDuration` immediately before and after each variant work batch, converts its seconds delta to milliseconds, checks finite strictly positive deltas and exact checksums. That makes **36 million executed mixed-graph calls** in this CPU-control phase, independent of the original 12x100k wall clock phase.

## Observed real Chrome 157 values

| Boundary | Native original | Owner-specific compiler | Globally reserved esbuild |
| --- | ---: | ---: | ---: |
| Median `TaskDuration` delta, 1 million calls | **12.283 ms** | **12.0045 ms** | **12.224 ms** |
| Compiler/native ratio of medians | | **0.9773×** | |
| Compiler/reserved esbuild ratio of medians | | | **0.9820×** |
| One-sided 98.07%-coverage upper paired median ratio | | **0.9846×** vs native | **0.9917×** vs reserved |
| Individual paired work samples ≤2.5× | | **12/12** vs native | **12/12** vs reserved |

The raw task deltas were approximately **11.82–12.67ms** for the transformed compiler, **12.05–13.27ms** for native, and **12.02–12.60ms** for safely reserved esbuild. The comparator's output and numeric checksums matched all 36 work batches and all previous full-tuple semantic controls.

This is stronger evidence that **the selected million-call renderer-thread application workload** remains near native compute cost. The metric is a thread-duration counter, not an explicit isolation of V8-only CPU instructions: intervening renderer-thread tasks may contribute. It does not automatically prove hardware-clock CPU time, or attribute the earlier **8.7ms/2.7ms** short-work wall outlier to scheduler or JIT. Different batch length, cache state and instrumentation distinguish these observations. The original strict **100k wall-work** breach persists in the release evidence. Neither finite 12-trial test certifies a universal 2.5× maximum.

This result measures performance and semantic preservation for the **four-module property-selective graph only**; it adds no static/dynamic attacker resistance or domain-lock security claim. Strong-obfuscation release remains **RELEASE-BLOCKED**.

**Reproduction:** `test/cross-file-imported-identity-browser.js`; `.github/workflows/manual-imported-identity-alias.yml`; executable `9c769225b56e1aa52e0e0b62a5b448f14d83487b`, [CI 44949537210](https://github.com/FlareZ123/obfs/actions/runs/44949537210).
