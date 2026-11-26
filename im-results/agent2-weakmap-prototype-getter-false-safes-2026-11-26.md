# WeakMap reference-only Storage proof: prototype-getter false-safes

**Status:** confirmed candidate-specific correctness/security false-safe; no production fix is included in this report.

## Summary

The candidate's new WeakMap prototype-introspection guard is bypassed by four standard reflective routes that recover the legacy `Object.prototype.__proto__` getter:

1. `Object.prototype.__lookupGetter__('__proto__')`
2. `Object.getOwnPropertyDescriptor(Object.prototype, '__proto__').get`
3. Aliased descriptor method: `const getDescriptor = Object.getOwnPropertyDescriptor; getDescriptor(Object.prototype, '__proto__').get`
4. Reflective retrieval: `Reflect.get(Object.prototype, '__lookupGetter__').call(Object.prototype, '__proto__')`
5. Aliased Reflect method: `const getReflect = Reflect.get; getReflect(Object.prototype, '__lookupGetter__')` followed by the same legacy getter call

Calling the recovered getter with `new WeakMap()` returns `WeakMap.prototype`. Replacing that prototype's `set` method makes the candidate's supposedly reference-only Storage override perform a DOMString conversion of the stored function. The compiler nevertheless treats the WeakMap as stable, skips the source-observation refusal, and rewrites local identifiers.

The original and transformed programs return the same application values, but the host-observable function source differs. This is a concrete false-safe in the reviewed candidate, not merely a theoretical instrumentation concern.

## Candidate and source location

- Reviewed branch: `agent1/storage-weakmap-falsifier-20261126`
- Source guard commit: `a713f7077607e8c39787df63f0e60a676cf8407e`
- Refusal-test commit: `6e7888ae33b47a7f5cda432b545088c75b937a54`
- Relevant code: `src/ast.js`, nested `isStableWeakMapInstance()` within `observesFunctionSource()`
- Relevant existing regression: `test/agent4-weakmap-prototype-escape.test.js`

The candidate guard added checks for `getPrototypeOf` and `__proto__` member access, plus a property key named `getPrototypeOf`. These routes recover the accessor through legacy or reflective APIs instead of directly accessing the WeakMap instance's prototype.

## Reproducer

The essential prototype recovery and mutation are:

```js
const getPrototype = Object.prototype.__lookupGetter__('__proto__');
// Alternative:
// const getPrototype = Object.getOwnPropertyDescriptor(
//   Object.prototype, '__proto__'
// ).get;

const weakMapPrototype = getPrototype.call(new WeakMap());
const nativeWeakMapSet = weakMapPrototype.set;

weakMapPrototype.set = function (key, value) {
  document.title = value;
  return Reflect.apply(nativeWeakMapSet, this, [key, value]);
};
```

The test then installs a `Storage.prototype.setItem` override whose only apparent operation is `captured.set(this, value)`, where `captured` is a locally constructed WeakMap. The source-observation proof accepts that override as reference-only. But its `set` call resolves through the mutated global WeakMap prototype and coerces the function through the Document.title setter.

## Reproduction evidence

The test-only branch is `agent2/weakmap-lookupgetter-audit-20261126`.

| Workflow run | Test branch commit | Cases | Result |
|---|---|---:|---|
| [45854080137](https://github.com/FlareZ123/obfs/actions/runs/45854080137) | `46aba3db753066980fea71b6463b1ba84d24ccf7` | `__lookupGetter__` | Failed on Ubuntu, Windows, macOS |
| [45854404395](https://github.com/FlareZ123/obfs/actions/runs/45854404395) | `e363018c73b942b5f05c46b3860a83df22feb03c` | `__lookupGetter__` + descriptor getter | Both failed on Ubuntu, Windows, macOS |
| [45854804850](https://github.com/FlareZ123/obfs/actions/runs/45854804850) | `e0301a3f508217955a489b0913a0329a266752f1` | Four cases: direct, descriptor, aliased descriptor, Reflect.get | All four failed on Ubuntu, Windows and macOS |
| [45855558815](https://github.com/FlareZ123/obfs/actions/runs/45855558815) | `25ef2be99e4b6aefaf0d4f3a122f442b291540dc` | Five cases, adding aliased Reflect.get | All five failed on Ubuntu, Windows and macOS |

All runs used the existing `manual-validation.yml` focused-test path with Node 22.23.4. These were targeted falsification runs, not full-suite acceptance gates. All three runs completed with the expected failing tests on Ubuntu, Windows and macOS. The expanded four-case and five-case matrices reproduced every included variant on all three platforms.

The platform logs show the following failure signature:

- `observesFunctionSource(ast) === false`;
- `metrics.bindings === 5`;
- native and emitted return values are both `{value: 29, independent: 7}`;
- native captured source contains `privateLocal`;
- emitted captured source contains the rewritten name (for example `_v27f826000fe3`).

Thus ordinary return-value differential testing alone would miss the observation mismatch. The source string is an independent observable.

## Scope and limitations

- The reproduced compiler mode is COO with `properties:false`, `identifiers:true`, and `strings:false`, isolating identifier rewriting and the Storage observer.
- The tests run Node ESM with explicit Storage and Document.title shims. The initial two-route, expanded four-route and final five-route tests completed on Ubuntu, Windows and macOS. These tests do not constitute real-browser Chromium validation.
- The result establishes a false-safe in the exact reviewed candidate at `6e7888a`. It does not claim that a later repaired candidate or current `main` has the same defect.
- No production source file was modified by this audit; only test code was added on the isolated Agent 2 branch.

## Required follow-up

The WeakMap-specific proof must fail closed when prototype getter extraction can reach a WeakMap instance's prototype, including the four reproduced routes and statically computed/aliased variants. A guard limited to the names `getPrototypeOf` and `__proto__` as member accesses is insufficient.

Agent 1 and Agent 4 were notified through their mailboxes. PR #382 remains draft; Agent 2 explicitly withheld authorization to move its head while this false-safe remains unresolved. The candidate needs a new exact-head independent challenge and full required validation after the guard is repaired.

The aliased descriptor, direct Reflect.get, and aliased Reflect.get variants are also confirmed false-safes on Ubuntu, Windows and macOS in runs 45854804850 and 45855558815.
