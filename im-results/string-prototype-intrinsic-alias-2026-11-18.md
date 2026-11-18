# Alias-aware String prototype admission for the eager decoder

**Date:** 18 November 2026. **Classification:** bounded compiler-correctness evidence, not strong-obfuscation security.

## Source-visible failure envelope

The SNO/COO opt-in eager XOR string decoder reads each encoded character through `raw.charCodeAt(j)`. A supplied CommonJS dependency can run before the target module and replace `String.prototype.charCodeAt`, while the native target's literal value remains independent of that method. For such a graph, emitting the decoder is an unsound semantic admission.

The existing `src/core.js::mutatesDecoderIntrinsic` recognized direct `Object.getPrototypeOf("")` and `Reflect.getPrototypeOf(new String(""))`, but its `isStringPrototype` call-expression branch compared the intrinsic receiver's literal identifier spelling. The compiler already maintained conservative fixed-point alias sets for `Object` and `Reflect`; those sets were not used in this one branch. A caller could therefore take the prototype through `const O=Object; O.getPrototypeOf("")`, `const R=Reflect; R.getPrototypeOf(new String(""))`, or their `globalThis` member spellings and replace `charCodeAt` before the decoder was initialized.

The four new cases in `test/ambient-string-alias.test.js` construct three supplied CommonJS files. `entry.cjs` loads the mutator first, then the protected literal target. The baseline process returns the original literal. Each case separately runs SNO and COO obfuscation with `strings:true`; it checks compiler refusal and exact child-process output. The `Reflect` variants pass an actual String wrapper object, because `Reflect.getPrototypeOf` must throw on a primitive input, while `Object.getPrototypeOf` boxes primitives.

## Paired source-pinned evidence

- **Red:** corrected test-only commit `318b077c4862e41b11036335f34ea4f5cd0bc7dd`, [two-platform manual validation 44249535056](https://github.com/FlareZ123/obfs/actions/runs/44249535056). The Ubuntu behavioral phase reported the four newly added SNO refusal assertions failing: emitted literal count `1`, expected `0`. Each test stopped at the count assertion, so this run proves unsafe decoder admission, rather than a directly measured emitted/native output difference. The negative result is corroborated by the decoder's source-level dependency on overwritten `String.prototype.charCodeAt`. The initial version at `1d31469` incorrectly supplied a primitive to `Reflect.getPrototypeOf`; it was corrected before interpreting the red evidence.
- **Green:** source commit `c5112fac889080ec20e16ff3589682b11d7b372b`, [manual integration 44249988570](https://github.com/FlareZ123/obfs/actions/runs/44249988570), passed on Ubuntu and Windows. The full Node behavioral/adversarial suite, strict JSDoc checks and sampled benchmarks passed on both runners. Ubuntu's real Chromium integrations also passed. The new four regressions now complete native/emitted parity in both modes, and the established read-only alias and unrelated-prototype positive controls remain part of the suite.

## Narrow repair

`src/core.js::isStringPrototype` now resolves `Object` and `Reflect` receivers with the same `isObjectIntrinsic` and `isReflectIntrinsic` predicates already used by the surrounding analysis. This recognizes their declared aliases and direct `globalThis` member spellings without disabling an ordinary graph's decoder. It introduces no runtime code and no additional obfuscation claim.

The relevant ECMAScript normative contracts are [Object.getPrototypeOf](https://tc39.es/ecma262/2026/multipage/fundamental-objects.html#sec-object.getprototypeof) and [Reflect.getPrototypeOf](https://tc39.es/ecma262/2026/multipage/reflection.html#sec-reflect.getprototypeof). The latter requires an object argument.

## Limits and next proof obligations

The proof is syntactic and bounded to the supplied file group. Unknown environmental preloads, dynamic code, caller-mutated intrinsics, opaque aliases and arbitrary execution paths remain outside a general closed-realm proof. Refusing eager strings prevents an observed class of emitted decoder corruption; it does not increase static reconstruction cost, enforce host authorization, prevent runtime extraction, or establish a 2.5x limit for other workloads. The source-level string-instance argument alias case requires separate examination; even complete intrinsic tracking would not solve full-control COO/SNO hostility.

## Follow-up: local string-instance aliases and observed output corruption

A second negative family, added at `90fda6d08e34ab879fe76e52610831ff890613f2`, varied the source of the `getPrototypeOf` input: a local primitive string, a transitive primitive string alias, and a local `new String("")` wrapper alias. The original analyzer accepted a decoder for all three. The [red two-OS validation 44250510811](https://github.com/FlareZ123/obfs/actions/runs/44250510811) reported the three corresponding SNO decoder-admission assertion failures on both platforms.

To prove actual semantic divergence rather than only unsafe admission, an independent historical branch `agent10/string-instance-parity-red-20261118` starts from the vulnerable `90fda6` source and changes the same tests to execute and compare emitted/native processes **before** checking decoder counts. At `0c9508d73ebc746a463df025ae2f676ed9235b11`, [CI run 44252150865](https://github.com/FlareZ123/obfs/actions/runs/44252150865) reported all three SNO cases as *changed behavior of a valid preloaded CJS graph* on Ubuntu. The generated decoder called an overwritten `charCodeAt`, corrupting the result while the original target literal remained unchanged. This is a real 1:1 miscompile witness, on source-visible input. The branch is intentionally a negative control and must not be considered safe to release.

The repaired `src/core.js::mutatesDecoderIntrinsic` uses an additional fixed-point `stringInstances` set. Literal strings, no-substitution template strings, `new String` expressions, and their direct variable/assignment alias chains can now feed recognized `Object/Reflect.getPrototypeOf` calls. This changes compiler admission only, preserving generated runtime shape for eligible programs. The [source-pinned green full Node/Chromium validation 44251268380](https://github.com/FlareZ123/obfs/actions/runs/44251268380) succeeded on Ubuntu and Windows at `2ec87f49c69f5899b94aa4d3d9a12139be177ce4`. Added positive controls verify that read-only `String.prototype` aliases and an unrelated numeric-prototype graph still transform their target literals where the bounded proof admits them. A later mainline test ordering change, `3fef3bf0ce4be84a857f6536ce9d6039e305e62c`, checks exact runtime parity before refusal, preventing future count-only reports.

This remains an intentionally partial source-visible intrinsic analysis: arbitrary function-return values, custom prototype objects and unrestricted aliases can expose the same prototype without matching these literal/value shapes. No cross-runtime strong obfuscation or general budget claim follows.
