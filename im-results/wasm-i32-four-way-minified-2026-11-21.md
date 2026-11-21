# Same-trust four-way typed-Int32 Wasm comparison (21 November 2026)

## Research question and decision

Does the experimental public WebAssembly backend provide a credible performance or
reconstruction advantage over conventional unbundled JavaScript minification for a
three-module, external-callback ESM application under the COO threat model?

**Current answer: no independently demonstrated security advantage.** The public
binary's two selected functions are reconstructed into executable native ESM
without compiler source or the original input graph. A sample of actual Node
application-work timings also breaches the strict 2.5× target for short sessions.
The backend remains experimental and the primary release remains **RELEASE-BLOCKED**.

This report is intermediate reproducible engineering evidence, not a publishable
new protection theorem or a universal JavaScript claim.

## Reproduction

- Node experiment: `sims/wasm-i32-four-way-minified.js`.
- Chromium experiment: `test/wasm-i32-four-way-browser.js`.
- Workflow: `.github/workflows/manual-wasm-i32.yml`.
- Strict JSDoc project: `jsconfig.wasm-i32.json`.
- **Pinned full Node workflow:** [44942214736](https://github.com/FlareZ123/obfs/actions/runs/44942214736)
  at source commit `6095014078ca7361b0d8ff31baff7190a5b08c7d`,
  successfully completed on Ubuntu and Windows Node 22.23.5.
- **Pinned full Chromium extension workflow:** [44942599211](https://github.com/FlareZ123/obfs/actions/runs/44942599211)
  at source commit `a1a90590e8a7b9bc6475143ff37898ef0793470d`,
  fully green on Windows and Ubuntu Node 22.23.5, both strict JSDoc checks,
  and real Ubuntu Chrome 157.0.8103.78. This newer pin includes the
  Chromium browser evaluator.

Four variants use the *same* source graph and semantically equivalent entry point:

1. Native 392-byte unbundled ESM graph.
2. Conventional esbuild 0.28.2 `minify:true`, ES2022, unbundled graph (367 bytes).
3. COO-obfuscated two-function typed Int32 Wasm graph (1,355 bytes).
4. Public-output-only reconstructed native module replacing the Wasm kernel
   (396 bytes); the two recovering functions were counted and exercised.

Both platforms generated identical graph SHA-256 digests. The Wasm variant
digest is `8673631a9ef34bb2d3211db2bab087b0cd9bebe6754b6ba9edd92b4d53f039d5`;
the minified digest is `8eac4325e7451b41296692643def334634211d0f4a4722991123891c67c2458e`.
This confirms the *same delivered code* on both runners.

The selected application contains two integer kernels, a separate bridge
module calling `globalThis.externalBridge.deliver`, and an ESM entry module.
The generator inputs are signed Int32 Numbers, with a string label for each
callback. The experiment compares complete application output and the exact
host callback-value trace across the four variants. Both OS jobs passed all
comparisons, including strict JSDoc and the rest of the targeted Wasm workflow.

## Node 22 findings

Each row uses 12 rotating-order trials with a fresh ESM graph directory per
variant and trial. Ratios below are **ratio of measured medians**, protected
divided by native; strict breach counts are matched protected/native *work*
pairs above 2.5×.

| Workload calls | Ubuntu work ratio | Ubuntu strict breaches | Windows work ratio | Windows strict breaches |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 2.6325× | 8/12 | 2.7187× | 9/12 |
| 50 | 2.1643× | 3/12 | 1.5106× | 2/12 |
| 1,000 | 1.8768× | 0/12 | 2.1590× | 2/12 |
| 10,000 | 1.2203× | 0/12 | 1.1393× | 0/12 |

The full-session (ESM import plus work) protected/native ratios were
1.2514/1.2314/1.4749/1.1657× on Ubuntu and
1.1544/1.1185/1.3618/1.1040× on Windows, with **zero observed strict
full-session breaches** among the 48 pairs on either runner. This is a
measurement-boundary distinction. Short work timing includes first-use Wasm
compilation, while full-session timings add an approximately millisecond-scale
ESM load cost that may dilute the extra work.

The protected/minified *work* ratios were
2.9573/2.4113/1.8758/1.2432× on Ubuntu and
2.7509/2.1063/2.2313/1.1811× on Windows, respectively.
A conventional minifier remains a necessary equal-trust comparison.

Do not turn the small sample medians into worst-case performance statements:
the 1-call work region is only tens/hundreds of microseconds, susceptible to
clock granularity, JIT tiering and runner contention. The shared process
changes filesystem graph URLs, avoiding ESM cache reuse, but does not provide
independent process-start replicates. The experiment deliberately excludes
input generation, compiler/minifier work, attacker reconstruction, filesystem
writes, process startup, and output trace hashing from application timing.
The source-pinned evidence is enough to reject a **universal** 2.5× claim,
not to predict performance of other applications.

## Source-pinned real Chromium evaluation

The [green full Chromium extension workflow 44942599211](https://github.com/FlareZ123/obfs/actions/runs/44942599211)
on Ubuntu ran Chrome **157.0.8103.78** against the same four delivered
source digests as the Node experiment. The browser loaded separate
ESM modules over localhost HTTP under `script-src 'self' 'wasm-unsafe-eval'`.
It rotated four variant orders over 12 paired trials, with 10,000
typed Int32 events and exact external host callbacks for *each variant*
in *each trial*: **480,000 browser application events**. Full output
and callback trace parity passed for all four variants, including
the independently recovered native kernel.

The browser records latency for ESM module HTTP import, first invocation,
and after-warmup application work separately. The 10,000-event synchronous
application-work timings exclude HTTP import time and the first call.
The native and conventionally minified application-work medians were each
approximately **2.20 ms**; Wasm was **2.25 ms**. The measured ratio of
medians was **1.0227×** versus either native or minified JavaScript, with
**0/12 strict paired >2.5× breaches** against both controls. The
one-sided order-statistic upper median-ratio bounds were 1.2917× versus
native and 1.4583× versus minified for this bounded workload.

The separately measured first invocation (which includes deferred Wasm
compilation) ranged from approximately 0.1 to 0.7 ms for Wasm, versus
0 to 0.2 ms native in this sample. The browser clock displayed many
first-use increments of 0.1 ms or zero, so those microtimings cannot
support a precise effect-size claim. The browser did pass a separate
13.8 ms monotonic clock advancement control.

**Interpretation:** the browser's larger callback-heavy session can
amortize extra selected-kernel costs, while the *same published Wasm source*
is still recoverable into native ESM. No ratio from this workload certifies
any arbitrary browser, cold session, hot kernel, or user input. Keep
Node selected-work and Chromium whole-application boundaries distinct;
one cannot replace the other or justify strong protection release.

## Additional equal-trust Chromium selected-kernel control

**Pinned extension:** [workflow 44943009179](https://github.com/FlareZ123/obfs/actions/runs/44943009179),
source commit `3c66e2eaccf5a3a849c2e98312eba62ee3900691`,
both Ubuntu/Windows jobs green, including Ubuntu Chrome 157.0.8103.78,
strict JSDoc and the same four source hashes cited above.

The second browser evaluation extends rather than replaces the full
application work measurement. It resolves the public `kernel.mjs`
module by its served ESM URL and invokes both selected functions in
a 200,000-iteration typed-Int32 loop **per variant and per trial**,
after 16,384 untimed selected-kernel warmup iterations and the
original 10,000-event callback workload. Checksums of the selected
kernel work are compared across all four independent variants.
There were **9,600,000 checked selected-kernel iterations** in total
(four variants × 12 trial groups × 200,000 iterations), plus the
original 480,000 exact application/callback-trace checks.

| Real Chromium sample (12 paired trials) | Wasm/native ratio of medians | Wasm/minified ratio of medians | Native strict breaches |
| --- | ---: | ---: | ---: |
| Full callback-heavy application, 10,000 events | 0.9796× | 1.0667× | 0/12 |
| Direct selected-kernel loop, 200,000 iterations | 1.3056× | 1.0682× | **1/12** |

The selected-kernel measured medians were 5.40 ms native, 6.60 ms
minified and 7.05 ms Wasm, with a two-sided variation across trials.
The reported one-sided upper sample median-ratio bounds were 1.6418×
relative to native and 1.2941× relative to minified. One observed
selected-kernel pair exceeded the strict 2.5× native ceiling:
the first native trial measured 1.1 ms against 11.5 ms Wasm. That
trial is likely sensitive to warmup/JIT order and should not be
interpreted as typical steady-state runtime; equally, a strict
all-execution budget cannot discard unfavorable observed pairs
without a prespecified exclusion rule.

The earlier immutable browser run 44942599211 measured 1.0227×
for full application work and 0/12 strict breaches. The new pinned
run's approximately 0.98× whole-application median is another
bounded sample, not evidence of a universal speedup. Results on
both browser runs agree on executable source-only reconstruction.
No generic anti-analysis, anti-tamper, or strict all-workload runtime
advantage is demonstrated.

## Fresh-process four-way Node validation (stronger startup control)

[Full Ubuntu/Windows workflow 44943621143](https://github.com/FlareZ123/obfs/actions/runs/44943621143)
at immutable source `56d3e9cc100df991896ef687abfd023e7297c1d8`
completed with zero failed steps, including the new fresh-process
experiment, Chrome 157 browser integration, and both strict JSDoc
projects. The exact source digests for all four delivered variants
remain identical to the earlier Node/browser experiments.

`sims/wasm-i32-four-way-fresh-process.js` runs
`sims/wasm-i32-four-way-child.cjs` in a newly spawned **Node process
for every variant and matched trial**. It evaluates 1, 50, 1,000 and
10,000 event workloads under 12 rotating-order trial pairs, or
**192 separate processes per operating system** (384 total). This
eliminates reused Node import caches and same-process per-variant
JIT feedback as a direct source of the previous four-way data.
Each child receives exact equal precomputed typed inputs over stdin,
loads its graph, and evaluates the identical module's host callback
contract. Exact full output and callback trace hashes matched across
all four variants on both operating systems.

The child measures three separate regions: ESM import/evaluation,
synchronous application work, and their sum. The parent separately
records process startup + IPC + child wall time. The latter includes
noncompute costs and is **not** substituted for the protected/native
compute budget.

| Calls in each fresh process | Ubuntu protected/native work medians | Ubuntu strict paired breaches | Windows protected/native work medians | Windows strict paired breaches |
| ---: | ---: | ---: | ---: | ---: |
| 1 | **5.9080×** | **12/12** | **6.1435×** | **12/12** |
| 50 | **2.9805×** | **12/12** | **3.0646×** | **11/12** |
| 1,000 | 1.6761× | 0/12 | 1.7418× | 0/12 |
| 10,000 | 1.0900× | 0/12 | 1.1477× | 0/12 |

At one call the child-work native/Wasm median times were
0.0638/0.3771 ms on Ubuntu and 0.1049/0.6441 ms on Windows.
At 50 calls, native/Wasm medians were 0.1579/0.4706 ms on
Ubuntu and 0.2509/0.7691 ms on Windows. All measured one-call
pairs across both OS breached strict 2.5×; 23/24 measured
50-call pairs also breached. These are **actual observed
workload-specific runtime counterexamples**, with the limitation that
sub-millisecond timers and JIT initialization are noisy.

There were **zero observed strict child-import+work or process-wall
breaches** in this particular 48-pair per-OS matrix. That is expected
dilution from ESM loading and fresh process startup, and does not
invalidate the separate runtime-work veto. Client-side COO first-use
compilation is runtime computation and cannot take the server-only
initialization exception established for SNO/SCO environments.

This stronger process isolation qualifies earlier same-process
numeric ratios without changing the bottom-line security decision:
the public Wasm kernels remain statically reconstructable, and strict
2.5× work compliance is empirically false for this particular short
session fixture.

## Per-closure Chromium replication

[Full workflow 44943331420](https://github.com/FlareZ123/obfs/actions/runs/44943331420)
at source `5a7e95633636a06134e91b9a36261458263a7d5d`
repeated the real Chrome 157 four-way CPU comparison using one
distinct closed-over selected-kernel runner per variant. This avoids
putting all four JavaScript/Wasm function objects through a single
polymorphic invocation site. Chrome still matched all full application
traces and isolated-kernel checksums. Its selected-kernel
Wasm/native ratio of medians was **1.2735×**,
Wasm/minified **1.1920×**, with **one** observed strict paired
native breach. The 10,000-event callback-heavy app ratio was
**0.9623×** with zero strict paired native breaches. The first-trial
outlier survived this adjustment, so it cannot responsibly be
attributed solely to the earlier shared call site.

V8's [function architecture documentation](https://chromium.googlesource.com/v8/v8/+/refs/heads/main/docs/runtime/function-architecture.md)
describes feedback-vector allocation for closures, supporting
why variant-specific feedback is a reasonable benchmark control.
[Chrome's high-precision timer documentation](https://developer.chrome.com/blog/cross-origin-isolated-hr-timers)
states a coarsened 100-microsecond `performance.now()` resolution
for ordinary non-isolated pages, corresponding to the observed 0.1 ms
increment grid. These documents explain **possible confounders**;
the actual ratios above remain experimental measurements.

## Exact held-out Chromium integer-output differential

[Full Linux/Windows and Chrome 157 gate 44944098089](https://github.com/FlareZ123/obfs/actions/runs/44944098089)
at immutable source `3a5e16260e920ccfff8d186417f04a3099c58209`
passed all targeted typed-Wasm tests and strict JSDoc.

This revision performs an additional **1,200,000 exact
function-result comparisons** after all CPU timing, on 200,000
deterministic signed Int32 input tuples across both selected functions
and the three non-native variants (conventionally minified, public
Wasm, reconstructed-native output). It uses `Object.is` for each
numeric result. The original 480,000 application/callback tests,
9.6 million selected-kernel checksummed iterations and two-function
public-byte reconstruction also passed on this same source.

The Chrome 157 trial's 10,000-event application protected/native
ratio of medians was **0.9200×** (0/12 strict native breaches),
and the separately warmed 200,000-iteration selected kernel was
**1.3009×** (one strict native breach). These measurements again
differ from the fresh-process short-call Node evidence. The exact
individual-value differential strengthens semantic parity evidence,
while keeping the public-byte attacker reconstruction and
sample-specific performance restrictions intact.

## Independent threat and cost dimensions

| Requested dimension | Source-pinned finding for this selected COO typed-Int32 fixture | Inference limit |
| --- | --- | --- |
| Static deobfuscation / reconstruction | **Two out of two** published typed kernels independently recovered as executable ESM using only the public emitted Wasm module | Establishes a successful bounded grammar attack, not universal reconstruction of arbitrary Wasm or JavaScript |
| Dynamic analysis / runtime extraction | The protected browser can import and run the public Wasm module; exact output and callback traces are observable to the browser-controlled test harness | Instrumentation *resistance* was not independently established in this experiment |
| Unauthorized code modification / integrity | The selected Wasm transform supplies no independent trusted-secret integrity verification in the distributed three-file graph | No supported anti-tamper guarantee |
| Unauthorized environment execution / host lock | The specific four-way graph has no domain lock; source-only reconstructed code executes as standalone Node ESM and in Chromium | This experiment does not measure separately optional COO host-lock guards |
| Performance | 384 independent Linux/Windows fresh Node processes verify repeated strict short-session work-budget violations; large callback-heavy browser samples amortize work | No universal runtime ceiling or worst-case guarantee |
| Functional compatibility | Complete 4-way app and host callback parity, plus 1.2M exact Chrome integer function outputs, all source pinned | Covers this finite three-module grammar and tested environments |

**Combined decision:** the backend is a syntactic representation experiment with
real compatible performance on selected long workloads, yet the required
independent static confidentiality and universal strict 2.5× work properties
are both unproven or directly falsified in the tested scope.
Do not promote its security posture based on the favorable whole-app
or full-process session ratios. Strong-protection release stays blocked.

## Threat-model interpretation

A COO attacker can download the entire public artifact and instrument the
browser. The compiled Wasm initializer exposes all relevant bytecode, and the
existing independent `reconstructPublicWasmEsm` attacker synthesizes native
ESM without the protected compiler or original source. The test confirms
two recovered kernels and exact application/callback parity. It establishes
a scoped successful reconstruction of this grammar, while leaving arbitrary
Wasm programs and arbitrary JavaScript outside its claim.

These results do not support promotion to `results/`, a successful
environment-lock guarantee, runtime anti-instrumentation, or a strict global
compute-budget guarantee. Strong-protection release remains blocked.
