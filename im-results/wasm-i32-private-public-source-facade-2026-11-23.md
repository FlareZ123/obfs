# Public-source-compatible private Wasm i32 helper, three-mode positive control

**Agent 38; 23 November 2026. Classification: bounded executable compatibility evidence, not obfuscation security or 2.5× runtime proof.**

The default lexical backend has a broad externally visible callable-source regression (see [related 84-case report](commonjs-public-callable-identifier-observer-2026-11-23.md)). Under exact contextual semantics, a known public callable's native `Function.prototype.toString` must remain unchanged. A private arithmetic helper can nevertheless be transformed while keeping its exported facade's function source identical.

## Tested architecture

```js
function secretI32(x) {
  return (((x ^ 137) & (x >>> 3)) | (x << 7));
}
function published(x) {
  return secretI32(x);
}
module.exports = published;
```

The `experimentalWasmI32` backend selects **only** `secretI32`, with `identifiers:false`, `properties:false`, `strings:false`, while `published` retains its exact original body. The output has one actual WebAssembly i32 function and contains real `WebAssembly.Module` bytes. For ESM, change the final line to `export function published(x){return secretI32(x);}`; the same transformation is available.

This construction deliberately leaves the public facade unobfuscated. It encodes private helper arithmetic in public Wasm binary, which a source-only attacker can extract and symbolically recover with the existing `sims/wasm-i32-static-recover.js`. It is a compatibility pattern, not a confidentiality success.

## Exact reproducible observations

- Source test: `test/agent38-wasm-private-facade-source.test.js` at frozen branch SHA `f3462614b58278e3cba1772095f56f608325c9e7`.
- Two-platform focused [run 45128136157](https://github.com/FlareZ123/obfs/actions/runs/45128136157) **passed 3/3 tests on Ubuntu and Windows**, including strict project/external JSDoc gates. Main test-only integration commit: `589d436976d421aa95aaca2d4285c4ef59d644da`.
- Three mode options `coo`, `sno`, `sco`; each transforms exactly **one private helper** per CommonJS or ESM fixture. Native exported facade source remains **byte-exact under Function#toString**.
- In each mode and module format, 2,060 input comparisons cover signed Int32 endpoints, signed and nonfinite edge inputs, fractions, 2,048 deterministic integer vectors, with exact `Object.is` value parity: **12,360** fixture comparisons per OS.
- An explicit negative comparator selects the **public exported function itself** for Wasm lowering. All three modes still produce matching 2,060 value results, but the externally observed Function#toString differs from the original. This prevents falsely labelling arbitrary direct public-target virtualization as contextually equivalent.

The test is intentionally *green*, asserting the private positive and the publicly selected incompatibility as separate expected outcomes.

## Gate limitations and next steps

- There is **no measured runtime or startup budget** for the wrapped helper in this experiment. The 2.5× maximum cannot be certified from value/source parity; Wasm compilation and JS/Wasm crossings must be charged appropriately by mode, including browser initialization for COO/SCO.
- The source-only attacker already recovers analogous public i32 Wasm kernels, so a future evaluation needs an equal-trust minifier/service comparison and matched attacker attempt before any security improvement claim.
- The source observer only inspects the public facade and not secret helper internals. Under the full original adversary powers, the emitted files and Wasm bytes are still visible, so runtime extraction remains possible.
- This direct, primitive-expression selection does not establish soundness for side-effectful helpers, async callbacks, exported aliases, unknown property consumers, or arbitrary JavaScript. Each would need its own static proof and host differential.
- An opt-in source-observer-aware selector could nominate private helper functions instead of public callables, with no need to change the visible API function text. That design requires dynamic escape refusal and exact session-level profiling before automatic admission.

Status: **positive transformation-compatibility control with unmeasured runtime and no attacker-resistance evidence**. The overall three-mode release remains RELEASE-BLOCKED.

## Node 22 matched hot and first-use observations

A follow-up profile `test/agent38-private-wasm-facade-budget.test.js` at exact branch SHA `df7a28822d900b3c1371427b6099e561482b5c38` was executed by [focused two-platform run 45128690288](https://github.com/FlareZ123/obfs/actions/runs/45128690288), **green 1/1 test in each OS with strict JSDoc**. It recompiles the same publicly source-exact CommonJS wrapper and private one-function Wasm helper. A checksum validates every timed workload.

Each mode has 6 prewarm calls per variant, 13 alternating original/protected paired trials, and **400,000 hot invocations per trial**. The first-use comparison separately times a new Node VM context plus first function invocation (also 13 paired trials). All pairs were recorded inside one process, so pair independence and population-wide risk bounds are *not established*. Timings use `performance.now()`, a wall clock proxy for on-thread synchronous compute; they are not independent CPU-clock replications.

| OS | Mode | Hot ratio of medians | Strict hot pairs above 2.5× | First-use ratio of medians | Strict first-use pairs above 2.5× |
| --- | --- | ---: | ---: | ---: | ---: |
| Ubuntu | COO | 1.069× | 0/13 | 1.071× | 0/13 |
| Ubuntu | SNO | 1.076× | 0/13 | 1.043× | **1/13**, max 2.676× |
| Ubuntu | SCO | 1.104× | 0/13 | 1.122× | 0/13 |
| Windows | COO | 1.054× | 0/13 | 1.058× | 0/13 |
| Windows | SNO | 1.042× | 0/13 | 0.957× | 0/13 |
| Windows | SCO | 1.044× | 0/13 | 1.003× | 0/13 |

The one SNO Ubuntu first-use breach is a **real observed strict >2.5× ratio** in that sampled initialization comparison. The prompt explicitly permits excluding server-side SNO initialization from its sustained compute budget; that exception does not establish that every observed first-use task is a deductible initialization under an arbitrary workload. Here it is an explicit new-VM and first-call profile. Every hot pair was below threshold in this finite sample.

**Interpretation:** This bounded synchronous Node fixture shows a genuine nonzero private virtualization with source-exact public facade and modest **sampled** hot overhead, but neither the 2.5× universal rule nor attacker resistance is qualified. Browser and actual SCO service costs, GC tails, independently replicated process sessions, public static reconstruction against matched minifier controls, and other workloads remain necessary. No claim of binomial 95% confidence follows from 13 correlated trials in one runner.

## Actual Chromium public-facade positive

The separate opt-in `test/agent38-chromium-private-wasm-facade.test.js` on research branch `agent38/private-yield-observer-matrix-20261123` at SHA `fb3e648647314b9ff6f73629d7925e658871d425` runs a genuine HTTP origin plus headless Chromium, and installs an *unknown external importing page* after compiling only `public.mjs`. The compilation selects `secretI32` for WebAssembly (metrics `wasmI32Functions:1`) while preserving `export function published(value){return secretI32(value);}`.

[Focused run 45128792219](https://github.com/FlareZ123/obfs/actions/runs/45128792219) is **green overall**: Ubuntu real Chromium test **1/1 pass**, public `Function#toString` equals exactly `function published(value){return secretI32(value);}` for original plus all three mode options; both browser-observed function result and exported primitive snapshot also match. The Windows focused job **succeeded with the real-browser test skipped**, so it does not establish Windows Chrome coverage. Strict JSDoc gates passed.

This is the positive counterpart to the source-breaking unknown-import Chromium test `test/agent38-chromium-public-identifier-source.test.js`: both use unmodified browser Function#toString and independent externally served importing pages. The protected helper's public Wasm bytes remain recoverable, and no browser runtime budget was measured.

The browser test remains on its research branch: it is a real-Chromium fixture requiring an installed executable, unsuitable for unconditional `node --test` runs on developer machines without Chrome. The Node-only private facade positive regression has been committed to main separately.

## Zero-oracle source-only reconstruction of the private Wasm helper

The independently implemented reconstruction test `test/agent38-private-wasm-source-only-clone.test.js` at exact research SHA `7190dc48adf9d750ad2a818c63c55b85c5cd23dd` passed both Node 22 Ubuntu and Windows [focused run 45129176173](https://github.com/FlareZ123/obfs/actions/runs/45129176173), **1/1 case plus strict JSDoc per OS, overall GREEN**.

The adversary receives only the distributed JavaScript output from the three-mode compiler, without the private original source or obfuscator seed. An Acorn public-source parse finds the unmodified exported `published` facade, its direct `secretI32` callee and declared parameter. The independent public binary extractor in `sims/wasm-i32-static-recover.js` identifies embedded WebAssembly bytes and reconstructs a native JavaScript expression. The attacker then assembles a new CJS or ESM native implementation of the recovered private helper with the same public facade, **containing no WebAssembly**. Original, protected and reconstructed functions return exactly equal `Object.is` outputs for 2,060 signed, nonfinite, fractional, and deterministic integer inputs per mode and module form.

| Mode | Distributed CJS bytes | Distributed ESM bytes | Offline original/protected/native-clone matches |
| --- | ---: | ---: | ---: |
| COO | 522 | 638 | 2,060 CJS + 2,060 ESM |
| SNO | 522 | 575 | 2,060 CJS + 2,060 ESM |
| SCO | 526 | 630 | 2,060 CJS + 2,060 ESM |

The facade's native `Function#toString` also matches exactly between original and attacker clone in all six cases. The adversary uses **zero online oracle requests** and only the published JS + Wasm bytes. The decoder was already known to recover the project's restricted direct Wasm kernels; this reproduces the vulnerability when the numerical kernel is hidden behind a source-exact, unvirtualized public facade.

**Security disposition: static deobfuscation resistance is contradicted for this concrete protected-work pattern.** A 1.04–1.10× sampled hot-path overhead and correct callable-source behavior cannot be promoted into a claim of hard-to-recover private arithmetic. The test does not claim a universal attack on arbitrary JavaScript or all WebAssembly bytecodes.

## Numeric-domain boundary: object coercion is observably non-equivalent

A deliberately out-of-grammar negative control `test/agent38-wasm-object-coercion-boundary.test.js` at source SHA `8c3ebbd752cda78b3a2caa490978327f2794efe1` passed on both OS in [focused run 45129663694](https://github.com/FlareZ123/obfs/actions/runs/45129663694) (1/1 test plus strict JSDoc per OS). It compiled the private numerical helper in all three modes and both CJS/ESM distributions. It then passed host-side objects with side-effectful `Symbol.toPrimitive` or `valueOf` implementations, and one whose second `Symbol.toPrimitive` call throws.

The original expression `(((x^137)&(x>>>3))|(x<<7))` executes the primitive conversion **three times**. The WebAssembly entrypoint converts the incoming JavaScript object to an i32 **once**. All **18** object-probe cases recorded a semantic difference, identically on Ubuntu and Windows. Representative cases:

| Probe | Original behavior | Obfuscated helper |
| --- | --- | --- |
| Counter `Symbol.toPrimitive` | 3 coercions, result `1920` | 1 coercion, result `640` |
| Counter `valueOf` | 3 coercions, result `1920` | 1 coercion, result `640` |
| Throw on second coercion | 2 coercions, throws `Error: second coercion observed` | 1 coercion, returns `640` |

Every public facade retains **exact Function#toString** source even while the helper's results, exceptions, and observable coercion counts diverge. The transformed helper is a *typed-number domain* experiment, and its prior 2,060-input parity grid covered primitive Number values only. These 18 probes are **outside that explicitly stated narrow grammar**, so they invalidate promotion of the typed evidence into an **arbitrary JavaScript 1:1 semantics claim**. They do not contradict the numeric-input result. An automatic compiler admission proof must establish that no unknown caller can pass coercible objects, or must preserve the original multi-coercion behavior through a semantics-correct fallback. Such a fallback may also defeat the static obfuscation purpose; evaluate performance and attacker extraction independently.

Because this test asserts the known out-of-contract differential as a negative control, the CI test itself is green. It is retained on the research branch, not automatically merged into the main supported workload.
