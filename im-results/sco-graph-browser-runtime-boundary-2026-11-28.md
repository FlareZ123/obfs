# SCO private-graph batching: real Chromium paired runtime boundary

**28 November 2026 · Agent 31 · intermediate executable measurement evidence.** The reproducible harness is [`test/sco-graph-batch-browser-budget.test.js`](../test/sco-graph-batch-browser-budget.test.js) with isolated trusted-server fixture [`test/fixtures/sco-graph-batch-browser-server.cjs`](../test/fixtures/sco-graph-batch-browser-server.cjs). It exercises an opt-in batched module of a two-module JavaScript graph in **actual Chromium** and a separate trusted Node 22 process.

## Why the old browser clock was not evidence

Initial red-first measurement candidate `f8e77f10b36d6f3d870765492dddbf0889ede7bc` used Chrome's `--virtual-time-budget` with `performance.now()`, which can return exactly zero for fast operations. Its [Ubuntu + Windows run 46120412832](https://github.com/FlareZ123/obfs/actions/runs/46120412832) failed both systems on zero-duration samples despite correct JS result parity; **the zero-duration failure is a broken measurement clock, not evidence of a zero-cost obfuscator or a source semantic mismatch**. Similar Chrome virtual-time quantization was independently cautioned by Agent 10 in `communications/agent3/20261124T1335Z_agent10-browser-budget-timer-quantization.md`.

A repaired same-process Puppeteer/CDP candidate `79f0da3581b620d53d0700f7457db13987e0c60b` removed virtual time and used `Performance.getMetrics` (`TaskDuration`) plus `performance.now()`. [Run 46120551040](https://github.com/FlareZ123/obfs/actions/runs/46120551040) passed functional assertions on Ubuntu and Windows, but **is not a clean compute-budget receipt**. The whole Node test process also hosted Puppeteer/WebSocket CDP instrumentation; `process.cpuUsage` during an RPC therefore mixed driver and trusted-server compute. Windows short-interval CPU readings were often exactly 0 or 15–16ms, too coarse for ~3–10ms original browser work. Its Linux six-trial generated browser/server CPU ratios included one 3.63× sample, while Windows samples were dominated by quantization. Treat these as clues for a corrected experiment, not a proof of a universal budget.

## Isolated benchmark contract

The subsequent `5106337dbbfbf02f4dbbd224ee7bdad7af362508` design moves the original ESM namespace, batch compiler, HTTP handler, and per-request `process.cpuUsage` probe to a **separate Node child process**. The Puppeteer/DevTools driver runs in the parent and contributes no longer to the server process's CPU counter. The browser loads three same-origin ESM clients:
1. **Native original** source code from `/native/api.mjs` and `/native/secret.mjs`, exposed **only inside this diagnostic as a control**, not a production SCO publish policy.
2. **Generated SCO graph** batched facade from `/obfs/api.mjs`, with one actual RPC per eight calls. The private original source stays in the trusted server, except for the explicit native benchmark control.
3. **Ordinary esbuild-minified RPC transport**, sending precisely the same method IDs, argument values and JSON protocol to **the same** trusted server and policy. This equal-trust competitor is not an independent server or a no-server minified original; it isolates the cost of the generated transport from what ordinary minified server-private RPC already buys.

Each arm evaluates identical eight-input batches of a deterministic `Math.imul`-based pure-JS hash, and checks **each exact result** against the original Node module. This is a browser-compatible native reference (unlike a Node-only crypto/HMAC implementation). The test warms each client, then alternates execution order across paired trials. `performance.now()` from actual Chrome without virtual-time flags captures in-browser hot wall time including loopback fetch, while CDP renderer `TaskDuration` measures renderer work; per-RPC CPU snapshots in the isolated Node server measure private work plus JSON/HTTP handler execution. The sum of these latter two readings is only a **lower-bound approximation** of full system compute: Chrome's network-service process, kernel, cold loading, TLS, remote RTT and other work may be omitted.

The present multi-load candidate `a7e1d4b0725f99537898f9cda6ad655208c00b74` runs **250,000** and **5,000,000 iterations per call** separately, nine paired trials each, computes raw 2.5× sample breaches and distribution-free paired-median diagnostics (see `sims/paired-budget-bound.js`), and explicitly marks CPU results inconclusive whenever Windows yields zero server CPU samples. A one-sided 95% order-statistic median bound (if supported) is only evidence about the sampled workload/runner distribution under IID assumptions, **not** a worst-case or universal 2.5× guarantee.

## Interpretation limits

Even a perfect compatibility/CPU pass does not establish protection advantage: the native source is intentionally present as an experimental control, and the ordinary minified RPC baseline retains the same trusted private server. Real Chromium [authorized relay regression 46119703050](https://github.com/FlareZ123/obfs/actions/runs/46119703050) already shows an authorized client can reuse captured batch identifiers on new inputs; SCO cannot claim client-side tamper-proof enforcement against that adversary. A workload passing 5M iterations but failing at 250K is an **admission threshold**, not an inconsistency. Real remote authorization/database latency could raise the end-to-end slowdown beyond these local results. Combined and independent source-protection, static/dynamic extraction, environment locking, and paid runtime budgets remain release gates. Current project disposition **NO-GO**.

### CI receipts

- Virtual-time red measurement: [46120412832](https://github.com/FlareZ123/obfs/actions/runs/46120412832), both OS failed as expected from zero clocks.
- First CDP/same-process repair: [46120551040](https://github.com/FlareZ123/obfs/actions/runs/46120551040), both OS functional green; CPU denominator contaminated/quantized.
- Isolated Node server, 250K work: [46120755022](https://github.com/FlareZ123/obfs/actions/runs/46120755022), both OS functional green, but Windows per-request CPU quantized; Linux first generated wall trial >2.5×.
- Fine/coarse nine-pair test: dispatched after `a7e1d4b0`, **conclusion pending** at this report revision. Do not count it as green until the exact Actions result and raw logs have been inspected.

