# Typed-array chunk decoder: numeric-prototype isolation versus cold cost

**Date:** 17 November 2026. **Author:** Agent 10. **Status:** intermediate computational candidate, independently runnable from `sims/typed-array-decoder-tradeoff.js`. This script is an isolated competing decoder shape, **not production emitter behavior** and not an obfuscation-strength claim.

## Experiment

The existing opt-in local XOR string decoder's 4,096-unit path writes numeric indices to an ordinary JavaScript Array. A preceding module may install an inherited indexed accessor; then assignment to `units[0]` can be swallowed and spreading the array delivers an attacker-chosen replacement code unit. The production compiler now declines local encoding after recognizing such mutations in the supplied source graph (see `inherited-array-index-decoder-2026-11-17.md`). This conservatively reduces encoded-work yield.

The candidate uses `new Uint16Array(size)` and integer-indexed writes for 4,096-unit blocks, then spreads the typed array into `String.fromCharCode`. [ECMAScript 2026 TypedArray exotic `[[Set]]` step 1](https://tc39.es/ecma262/2026/multipage/ordinary-and-exotic-objects-behaviours.html#sec-typedarray-exotic-objects-set-p-v-receiver) directly uses `TypedArraySetElement` for a canonical in-bounds integer index on the typed-array receiver, so those assignments do not traverse numeric prototype setters. Their iterator, typed-array constructor, `String.fromCharCode` and `charCodeAt` remain mutable ambient dependencies.

The standalone script creates precompiled `vm.Script` variants: original static literal, ordinary-array XOR decoder, and typed-array XOR decoder. Both decoders consume the same fixed-key encoded UTF-16 code units. Each script runs in a **fresh Node VM context**, three warmups and 11 or 22 measured trials. Node startup and compilation are excluded. A correctness check compares exact UTF-16 including NUL, astral surrogate pairs and deliberately unpaired surrogates. Separate synthetic mutation probes introduce an indexed accessor on either `Array.prototype` or `Object.prototype`, or monkeypatch the `Uint16Array.prototype[Symbol.iterator]`.

## Pinned Linux Node 22.23.4 observation

[Manual cold-start run 44002855245](https://github.com/FlareZ123/obfs/actions/runs/44002855245) at exact source `416c4fafcfd1bf3ad64d5dcf1790728fd7da7337`, successful. Source digest of the 2,049-code-unit sample: `5b17cca1638d196d2986fb4d2f23e0adcabc32977c3b192fd8d582ebd836921d`.

| Fresh-context sample | Native static literal (ms) | Ordinary Array decoder (ms; ratio) | Typed Array decoder (ms; ratio) |
|---|---:|---:|---:|
| 2,049 UTF-16 units | 0.572550 | 0.647259; **1.146×** | 0.756503; **1.340×** |
| 65,536 UTF-16 units | 0.548825 | 3.162947; **5.945×** | 4.592105; **8.631×** |

The measured ratio denominator was an independent 11-trial native run, so the separately printed 'native' row from the 22-trial strategy sweep may differ slightly from 1.0×. These are noisy cold-context timing observations on one Linux runner, with compilation excluded, and cannot establish deterministic per-environment bounds.

The mutation controls passed:

| Mutation | Original | Array-based decoder | Typed-array decoder |
|---|---|---|---|
| Inherited indexed accessor on `Array.prototype` | correct | **corrupt** | correct |
| Inherited indexed accessor on `Object.prototype` | correct | **corrupt** | correct |
| Patched `Uint16Array.prototype[Symbol.iterator]` | correct | correct | **corrupt** |

## Engineering decision and limits

Typed arrays provide a credible bounded alternative for the **numeric-index prototype pollution** class, with no universal ambient safety: the test intentionally defeats their mutable iterator. New constructor/iterator alias and cross-file guards would be mandatory before any compiler integration. This specific synthetic 65,536-unit cold COO payload exceeded the allowed 2.5× runtime bound with **both** decoders, and the typed candidate was slower on the tested runner. The typed backend therefore **was not adopted** into the production compiler. The existing conservative fail-closed intrinsic guard remains the preferred behavior-preservation measure for this limited evidence. Eligible SNO server initialization may be amortized according to the project prompt, but client-side COO time cannot; the experiment does not measure a sustained SNO session.

Before any future typed decoder adoption, test cross-platform/browser compatibility, multiple function-arity limits, hostile intrinsic mutation through aliases, cold-start budgets on real workloads, and whether the alternative preserves actual protected-work yield compared to native/minified controls.

## Cross-platform replication

A separate Windows-only job was added to the existing manual cold-start workflow, without repeating unrelated full benchmark suites: [commit `e13b1fb8`](https://github.com/FlareZ123/obfs/commit/e13b1fb81d2583254444bc4f544153a4eef2c5d1). [Run 44003576320](https://github.com/FlareZ123/obfs/actions/runs/44003576320), exact `13b3152ad67d89f1cc6d388ffdf78028ce1bc91b`, passed the original Ubuntu job and new Windows Node 22 job.

| Windows fresh VM sample | Native median (ms) | Ordinary Array median / native ratio | Typed Array median / native ratio |
|---|---:|---:|---:|
| 2,049 UTF-16 units | independent baseline ~0.877 | 0.8504 ms / **0.970×** | 1.2320 ms / **1.405×** |
| 65,536 UTF-16 units | independent baseline ~0.802 | 4.6842 ms / **5.839×** | 4.6616 ms / **5.811×** |

The Windows output independently reproduces all three correctness observations: inherited numeric `Array.prototype` and `Object.prototype` setters corrupt the ordinary-array candidate while the typed-array candidate survives, and patching the typed-array iterator corrupts the typed candidate. The 65,536-code-unit cold ratio exceeds the stated 2.5× ceiling for both isolated decoder strategies on this runner too. These sampled ratios exclude compile time and remain workload-specific; the new evidence strengthens the conservative decision against adopting the typed-array candidate as a generic COO decoder.
