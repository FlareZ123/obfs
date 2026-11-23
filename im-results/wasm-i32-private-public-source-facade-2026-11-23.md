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
