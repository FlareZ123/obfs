# Bound ESM export: constructibility exposes a private target's function source

**Status:** Intermediate exact-source compatibility counterexample and conservative-refusal control, 22 November 2026. This report makes no confidentiality, tamper-resistance, or universal 2.5× performance claim.

## Scope and observation

An ordinary bound function generally reports a native-code string from its own `Function.prototype.toString`. When the bound target is constructible, the `new` operation can expose its target's prototype through the constructed instance. With the ordinary default `prototype.constructor` reference, the embedding application can retrieve the original function object and call `toString()` on it.

The actual deployed-source path under test is:

```js
const owner={secretField:7};
function internal(privateInput){return owner.secretField+privateInput;}
export const hot=internal.bind(null);
```

An independently imported module can evaluate `Reflect.construct(hot,[3]).constructor.toString()` without importing `internal` or possessing a direct reference to its name. This makes rewriting `privateInput` or `secretField` observable through an exported function value. `hot.toString()` remaining byte-identical is an insufficient semantic parity test for this constructible case.

The behavior is consistent with [MDN Function.prototype.bind](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/bind) and [ECMAScript bound-function exotic-object semantics](https://tc39.es/ecma262/2026/multipage/ordinary-and-exotic-objects-behaviours.html). The concrete test is executable against real Node ESM loaders, without shell interpolation.

## Source-pinned differential results

| Case | SHA and link | Ubuntu / Windows result | Meaning |
| --- | --- | --- | --- |
| Main with genuine local record and parameter rewrites | `8d3c96fb810f4ff9354714d4adaa2d75bec1e7d6`, [workflow 44998772452](https://github.com/FlareZ123/obfs/actions/runs/44998772452) | **Red / red** | Native and emitted `hot(3)` and `hot.toString()` matched, while construction exposed different `internal.toString()`: the changed key and parameter names were visible |
| Frozen Agent16 public-source proof plus identical adversarial fixture | `f5b24ca9ab5030660e5f802c95cecc0d1504f6f3`, parent `970290dfaeec05283d9a2d9248870195316ce34a`, [workflow 44998844665](https://github.com/FlareZ123/obfs/actions/runs/44998844665) | **Green / green** | The stricter candidate emitted no property or identifier renames for this constructible source path, preserving the tested target source |
| Main, deliberately nonconstructible arrow target | `794011e8b68e64b79384379a88948ce8a2dd6624`, [workflow 44998729182](https://github.com/FlareZ123/obfs/actions/runs/44998729182) | **Green / green** | Two private keys are rewritten while the bound public function's `toString`, `name`, `length`, `Reflect.ownKeys`, 20 numeric calls and the tested constructor refusal agree |

The **red-first** exact runnable test is at [`test/constructible-bound-source.test.js`](https://github.com/FlareZ123/obfs/blob/agent29/constructible-bound-source-witness-20261122/test/constructible-bound-source.test.js) on independent branch `agent29/constructible-bound-source-witness-20261122`.

The same test, without assertions relaxed or compiler source modified, is at [the strict-candidate branch](https://github.com/FlareZ123/obfs/blob/agent29/constructible-bound-on-agent16-20261122/test/constructible-bound-source.test.js) `agent29/constructible-bound-on-agent16-20261122`.

The positive nonconstructible case is in [`test/source-stable-bound-export.test.js`](../test/source-stable-bound-export.test.js) on main. It deliberately changes the target from a constructible function declaration to an arrow whose bound version is not constructible. The test explicitly checks that `Reflect.construct` throws in both native and transformed output.

## Exact failing emitted and native source strings

The Ubuntu failure (Windows independently failed at the same comparison):

```text
emitted: function internal(_v8c73ad8a2dce){return owner._p60b668a3a1+_v8c73ad8a2dce;}
native:  function internal(privateInput){return owner.secretField+privateInput;}
```

## Interpretation

This is a real compatibility counterexample for an externally callable exported bound **constructible** function when the compiler renames an underlying private target's identifiers or member spellings. It is narrower than complete source observability of arbitrary objects. The fixed strict public-source branch preserves this test by conservatively declining transformations, so the evidence does not justify accusing that candidate of unsoundness.

A positive narrow lane exists for a bound, *nonconstructible* arrow in the sampled graph. Nonconstructibility closes this particular prototype-constructor recovery path. It says nothing about instrumented clients, global hooks, debugger access, stack formatting, native patches, or other ways the attacker might inspect the bound target. The emitted JavaScript still exposes its private computation to a full-control client.

To integrate the more conservative source contract, require this red-first test alongside a nonvacuous private-work positive and public-source parity under all enabled transformation passes, on **one exact integration source**. Any asserted SCO or COO authorization, reconstruction resistance, or runtime cost needs separate evidence. For SNO, a filesystem and memory-owning attacker is outside any useful code-only secrecy boundary.
