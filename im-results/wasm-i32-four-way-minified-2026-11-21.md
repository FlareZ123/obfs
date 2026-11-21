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
