# Adjacent own-data primitive ESM export proof (23 November 2026)

**Classification:** narrow compiler-provenance improvement, intermediate engineering evidence; no strong-obfuscation or release claim.  
**Agent:** 6.  
**Source base:** `b880f1c66935e39babe63b6f7466c6d317289fb5` (main at branch creation).  
**Branch:** `agent6/adjacent-owned-field-primitive-20261123`.  
**Final tested patch source:** `d1e16e63f4559d817858a9039ac38778ce3b46d9`.  
**Validation:** [red-first 45259145638](https://github.com/FlareZ123/obfs/actions/runs/45259145638); [initial green 45259438189](https://github.com/FlareZ123/obfs/actions/runs/45259438189); [expanded green 45260238307](https://github.com/FlareZ123/obfs/actions/runs/45260238307).

## Precise candidate

In `src/cross-properties.js`, `collectVerifiedImportedPrimitives` now carries a primitive fact for:

```js
export const state = { secretValue: 3, otherKey: 5 };
export const internalValue = state.secretValue;
```

Only when the two declarations are **immediately adjacent top-level single-declarator `const` statements**, both local names have unique declaration provenance, the first initializer is a plain object literal with unique noncomputed identifier keys and primitive literal values, the selected field is a known own field, and the second initializer is a direct nonoptional, noncomputed dot-member read of that exact binding. All intervening statements, possible side effects, accessors, spreads, shorthand, computed keys, dynamic factories, mutations, unknown fields, and nonprimitive literal values are declined. The proof does not copy or evaluate the field value during compilation: it transfers a boolean primitive-kind fact through the already-existing explicit ESM named-import graph.

The rule relies on the ECMAScript [Object Initializer](https://tc39.es/ecma262/2026/multipage/ecmascript-language-expressions.html#sec-object-initializer) creation of own data properties and sequential execution of adjacent synchronous lexical initializers. An inherited getter cannot replace an own literal data field on the newly created object. Strict adjacency removes the need to prove that no earlier/synchronous same-module operation mutates or proxies that binding before the second read. This is a bounded syntactic proof, not a general heap analysis.

## Reproduced behavior

A four-file ESM corpus exports the literal owner and adjacent field-derived value, then consumes the owner through both a local function/alias and destructuring from two independent workers. The index combines two imported worker values under numeric unaries and the primitive field value. It retains exactly **1 proven cross-file object and 2 renamed properties**, with actual native/emitted result **29**.

At `9ff9cc20689e238301637aa187f7798e7f734824`, before the compiler patch, Ubuntu and Windows [run 45259145638](https://github.com/FlareZ123/obfs/actions/runs/45259145638) failed the new test because the imported primitive fact was absent. The existing conservative reader refused the graph (0/0). The targeted patch at `6effb37f8300ece275c9b01ae28a644d102a881b` passed the original positive and eight negative primitive-provenance cases on both operating systems, along with strict project/external/budget JSDoc, [run 45259438189](https://github.com/FlareZ123/obfs/actions/runs/45259438189).

The expanded `test/adjacent-owned-field-imported-primitive.test.js` additionally verifies **COO, SCO and SNO core `obfuscateFiles` outputs** against the same Node ESM native result; one callable-mutation counterexample requires full source preservation, and one hostile inherited `Object.prototype.secretValue` accessor must leave the primitive result unchanged. All cases passed on Ubuntu and Windows in [run 45260238307](https://github.com/FlareZ123/obfs/actions/runs/45260238307) at `d1e16e63f4559d817858a9039ac38778ce3b46d9`, including strict JSDoc. The first expansion run at `fcc828994096903fcfb87a997500e767ddde0ac1` had already passed all behavioral tests but failed strict JSDoc because its fixture used `delete Object.prototype.secretValue`; the final source uses `Reflect.deleteProperty` for typed cleanup.

The negative classification matrix explicitly declines an intervening property mutation, intervening opaque call, literal getter, computed key, forward TDZ owner, missing own key, function-valued initializer, and dynamic owner factory. It is part of the executable test, not only this prose.

## Broader targeted compatibility and real browser

Two established source-observation regression suites remained green on both Windows and Ubuntu, exact source `c7efeeada013de7f143d27e0441f9fb635b53e52`: [focused imported primitive source proof 45260914783](https://github.com/FlareZ123/obfs/actions/runs/45260914783) and [focused direct reader primitive proof 45260921251](https://github.com/FlareZ123/obfs/actions/runs/45260921251). Both also passed strict JSDoc checks.

An additional deterministic 15-case matrix (five primitive kinds: number, boolean, null, string, BigInt; three field names: `secretValue`, `_privateValue`, `toString`) validates primitive provenance and native-vs-emitted Node ESM results. All cases and strict JSDoc passed on Ubuntu/Windows at `1f6f626134a3df915f9c6f72fb67ab194c52b989`, [run 45261132228](https://github.com/FlareZ123/obfs/actions/runs/45261132228).

A dedicated network-served four-module Chromium differential was added as `test/adjacent-owned-field-chromium.test.js` and included in the external strict-JSDoc gate. It serves separately scoped native/emitted ESM modules from an actual local HTTP server, imports both through Chromium's genuine module loader, and compares result **29** while retaining the **1 object/2 properties** proof requirement. [Run 45261570980](https://github.com/FlareZ123/obfs/actions/runs/45261570980) at `17d7e58bf5d62797f8b52cd5e1ae94d2dce5c2eb`: Ubuntu **1 real Chromium test passed, 0 skipped**, ~10.9 seconds; Windows **browser test skipped** because Chrome binary is unavailable there, while all focused steps and strict JSDoc passed on both OS. This is actual Chromium evidence on Linux only. The Chrome test is skipped automatically when the executable is absent.

## Compatibility scope and limitations

- **No obfuscator VM, runtime wrapper or new network requirement** was added; the change only expands a compile-time primitive fact, so there is no additional emitted-runtime operation attributable to this proof. This does not establish 2.5x compliance of the whole obfuscator.
- The validation covers all three **core output modes**, using real Node 22 ESM execution. It does not execute the SCO request-time handler or SNO packaged launcher. One Linux Chromium ESM differential passes separately as described above. The existing mainline comprehensive Node/browser acceptance remains red or unproven for this exact patch SHA.
- The protection decision remains conservative if an exported callable's source could be observed: `export function internal(){return state.secretValue;}` is separately tested and declined in [draft PR #352](https://github.com/FlareZ123/obfs/pull/352), with no production source rewrites in that PR.
- This proof does not generalize to alias chains, imported owner reads initialized in another module, unrelated top-level values, cycles with unknown effects, functions returning fields, or member reads separated by even one program statement.
- The added provenance should be subjected to broader source-observer tests before any main integration, and results should retain the immutable SHA. **RELEASE-BLOCKED** remains the current objective verdict.

## Reproduction

Test file: `test/adjacent-owned-field-imported-primitive.test.js` (included in `jsconfig.external.json`). Production change: `src/cross-properties.js`. Use the documented manual-validation workflow with `focused_test=test/adjacent-owned-field-imported-primitive.test.js`, source pinned as above. Both complete focused OS jobs passed in green 45260238307; the workflow's unfocused full `node22` job was skipped.
