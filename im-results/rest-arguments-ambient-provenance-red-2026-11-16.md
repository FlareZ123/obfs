# Rest parameters and implicit `arguments`: unresolved ambient effect transport

**Agent 4, 2026-11-16. Reproducible negative result.** This is an intentionally **unmerged** adversarial test-only branch and a proposed research direction. The production obfuscator has *not* been repaired for these cases. Do not incorporate the red tests into the main mandatory test suite until a sound preserving change is validated.

## Pinned empirical counterexample

Branch `agent4/rest-and-arguments-effect-probe-20261116`, test-only SHA `2bee8cac5cce9c5767598048e28a6c7d90be0de0`, appends four source-visible real Node ESM host-effect cases and one benign positive to `test/closed-record-host-formal-provenance.test.js`. The compiler source equals main after the merged PRs #31, #34 and #36. A fixed host preload registers `HOST_REFLECT` as a replacement for `Reflect.ownKeys` and dynamically imports `state.mjs` to obtain `Object.keys(ns.state)`. The separately imported `record.mjs` requests `Reflect.ownKeys` on an unrelated schema. The native output has original exported owner name `secretField`.

Four distinct invocations pass the ambient global root into a function but hide the flow behind an argument-vector abstraction:

1. `function rewire(...roots){const {['Ref'+'lect']:cap}=roots[0];cap.ownKeys=globalThis.HOST_REFLECT;} rewire(globalThis)`
2. `function rewire(){const {['Ref'+'lect']:cap}=arguments[0];cap.ownKeys=globalThis.HOST_REFLECT;} rewire(globalThis)`
3. Equivalent rest-parameter arrow function invoked by `rewire.call(null,globalThis)`
4. `function rewire(first,...roots){...roots[0]...;} rewire(7,globalThis)`

The published emitted property name changes from `secretField` to randomized `_p...`, which the fixed runtime host callback directly observes. The emitted result therefore differs from the native result. These are output-semantic failures in the compiler's cross-file property-renaming exception, **not** merely different source representations.

The [manual validation 43901140241](https://github.com/FlareZ123/obfs/actions/runs/43901140241) at exact test-only SHA `2bee8cac5cce9c5767598048e28a6c7d90be0de0` completed with **four failures out of 1,731 Node tests on Ubuntu and four identical failures out of 1,731 on Windows**. The separate benign test `function size(...items){return items.length;}void size(7)` retained **one real property rename** and original/generated behavior parity. Thus full-graph refusal is not the observed default and the evidence measures unsafe acceptance separately from a nonvacuous positive.

## Mechanism and generalizable fix direction

The current callsite-to-formal propagation tracks direct `Identifier` and `ObjectPattern` formal bindings, plus a finite set of direct/native invocation adapters and partially bound function signatures. In these four cases, the parameter is an `RestElement` whose value is an indexed **argument vector**, or the ordinary function reads the implicit `arguments` object. The actual `globalThis` is present in the direct callsite, but that indexed-value origin does not propagate into the nested object-pattern extraction. Therefore the scanner does not learn that the later `cap.ownKeys` assignment mutates the shared `Reflect` capability.

Avoid patching each `roots[0]` AST syntax in isolation. A reusable conservative value/effect analysis should model:

- **Function identity and lexical binding identity**, distinguishing arrow lexical `arguments` from ordinary function-owned `arguments` and avoiding same-name scope confusion.
- **Callsite actual-argument vectors** as abstract values, preserving position through direct calls, known `.call`/`.apply`/`Reflect.apply`, bound-prefix offsets, rest-argument slicing and array/destructuring access.
- **Indexed operations** `args[i]`, literal and proven immutable index expressions, alias/return/container flows, with `Unknown` for unproved computed indices, spread iterators, rebindings or imported opaque callsites.
- **Effect summaries** joined interprocedurally: `MayMutateNativeReflect`, `MayInvokeOpaqueHost`, `MayObserveExportedKey`, `MayEscapeOwner`. Only prove a private key safe if none of its relevant mutable-intrinsic/native-method assumptions can be invalidated.
- **False-refusal control:** retain independent safe one-key and six-module two-key positive applications, and report protected-work fractions alongside native/emitted semantics. A blanket zero-transformation policy is not a sufficient research improvement.

This extension should be evaluated against Agent6's `workplace/ambient-capability-effect-proof-design-2026-11-16.md`, the already merged call/bind tests, and the independent public-only attacker. The changed original/emitted output is a **semantic correctness** bug and says nothing by itself about making code harder to clone. COO/SNO fully controlled runtime exposure remains an independent limitation; finite runtime performance samples do not prove the 2.5× bound on arbitrary source.

## Reproduce

Check out test-only SHA `2bee8cac5cce9c5767598048e28a6c7d90be0de0` on its research branch and run `node --test test/closed-record-host-formal-provenance.test.js`, or inspect the pinned Linux/Windows full workflow 43901140241. No production-source changes are present in this test-only branch. Preserve the original/emitted stdout plus `compiled.crossFile.properties` counts and distinguish four unsafe name rewrites from one unchanged benign real rewrite.
