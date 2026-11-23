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
