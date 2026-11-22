# Exported callable source contract

**Status:** implementation and regression work in progress; not yet established as a verified result.  
**Branch:** `agent39/exported-callable-source-contract-20261122`  
**Validation run:** [44987988939](https://github.com/FlareZ123/obfs/actions/runs/44987988939), dispatched at commit `a73dbeba061eed6ecbafa16ac7364bc7fd911646`; outcome pending at time of writing.

## Problem

JavaScript exposes callable source through `Function.prototype.toString`. A transformation that changes an exported function, class, method, getter, or a callable reachable through a public aggregate can therefore change program-observable behavior even when ordinary calls still return the same values. Avoiding edits inside a public declaration is insufficient if the output printer reprints the whole module; source bytes must remain unchanged.

## Implementation

A shared source-reachability analysis in `src/ast.js` identifies source-observable callable nodes. It follows ESM/CommonJS exports and aliases, aggregate values, object/class publication after export, getters/setters, class fields and static blocks, local inheritance, constructor-returned objects, and callable values returned, yielded, or awaited through local factories. The source ranges are consumed by identifier, string, property, symbol, and experimental transformation passes.

A narrow, separately proven exception permits local property/symbol changes outside the source range of a zero-argument primitive-leaf export in a selected source-observer island. It is not used by identifier, string, VM, flow, or Wasm passes.

Unknown callback arguments remain conservative. A limited native Promise case inspects callback return values for escaped callables without freezing the private handler's source; this assumes an unshadowed built-in Promise and requires further adversarial review.

The inspected transformation backends use source-range edits rather than whole-file AST reprinting. Wasm lowering and native reconstruction now support private arithmetic kernels behind stable public wrappers, preserving wrapper source bytes.

## Regression coverage

Added or extended:

- ESM and CommonJS exported callable source parity, including aliases and aggregate reachability.
- Class inheritance, constructor-returned aggregates, static-block publication, generator yields, and awaited factory results.
- Public function/class string-literal preservation with positive encoding yield in private helpers, including a real Chromium test.
- External source-observer-island tests in Node and Chromium for the narrow primitive-leaf exception.
- Exact comment/whitespace preservation for public callable source.
- CJS/ESM Wasm wrapper source parity through lowering and native reconstruction.
- Nested Wasm fuzzing with a private kernel behind a public wrapper.

Supporting fixtures were updated so benchmark and browser integration property readers use private kernels behind source-stable public wrappers.

## Evidence and limitations

An earlier validation run, [44987346729](https://github.com/FlareZ123/obfs/actions/runs/44987346729), passed strict JSDoc typecheck, external corpus typecheck, affine-oracle typecheck, and benchmark. It failed several tests that exposed fixture assumptions or over-conservative callback handling; those were addressed after that run. The current run 44987988939 is the first validation of the combined fixes and is still pending.

Do not promote this note to `results/` until the current Node and Windows suites, browser integration, verified-record profile, and adversarial source-parity tests pass. Remaining risks include native Promise monkey-patching assumptions and any missed callable escape through dynamic aliases or unknown factory behavior.
