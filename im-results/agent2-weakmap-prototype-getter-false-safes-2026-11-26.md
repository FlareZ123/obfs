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

## Subsequent challenge of Agent 10's group-level donor

Agent 10 incorporated the five getter-extraction regressions into a group-level WeakMap prototype veto. The five getter forms above all pass against that donor. I then challenged its exposure analysis with an object-property carrier:

```js
const getPrototype = Object.prototype.__lookupGetter__('__proto__');
const protoCarrier = { instance: new WeakMap() };
const weakMapPrototype = getPrototype.call(protoCarrier.instance);
```

The helper marks a WeakMap when it is passed directly as a call argument or when a `new WeakMap()` expression is nested inline inside a call argument. It does not propagate a WeakMap instance stored inside an object literal assigned to a local binding and later read through a member expression. In this witness, the getter call argument is `protoCarrier.instance`, which is neither a `NewExpression` nor an identifier in the helper's `weakMapInstances` set.

**Exact donor challenge:**
- Donor base: `agent10/weakmap-group-prototype-guard-20261126` at `c33773151acf0e8d5df1fb548085440ae4b84b76`.
- Test-only branch: `agent2/weakmap-carrier-alias-audit-20261126`.
- Test commit: `e7ca24857fb63085602a2f013cfc87c5f043ab93`.
- Test: `test/agent2-weakmap-prototype-carrier-alias-audit.test.js`.
- Focused run: [45859359998](https://github.com/FlareZ123/obfs/actions/runs/45859359998).

The focused logs show that all five earlier getter tests **pass** against Agent 10's donor on Ubuntu, Windows and macOS, but the object-carrier test **fails** on all three. Its failure signature is `observesFunctionSource=false`, `metrics.bindings=6`, identical ordinary return values, and different captured function source (native `privateLocal` versus emitted `_v4b5fd5930650`).

This is a distinct residual false-safe in the proposed group-level repair. A complete repair must track WeakMap instances through object/array containers and later member reads/aliases, or conservatively reject the relevant container escape. The direct-call-argument and inline-expression checks alone do not establish the required group-wide prototype safety.

Agent 10 and Agent 1 were notified. This audit remains test-only; it did not modify either production candidate branch.

### Additional container and factory-flow challenges

A follow-up matrix on the same Agent 10 donor found three additional ways to hide the WeakMap instance from the direct-call check, plus a local factory-return path:

- A separately bound WeakMap identifier stored in a local object property and later read as `protoCarrier.instance`.
- A WeakMap identifier stored in an array and later read as `protoCarrier[0]`.
- A local factory function returning `new WeakMap()`, with `makeProbe()` passed as the getter's receiver argument.

Together with the original inline object-carrier case, the four new variants are all reproduced. The first five getter-extraction tests pass against Agent 10's donor, but these four instance-flow tests fail.

**Exact follow-up:**
- Test branch: `agent2/weakmap-carrier-alias-audit-20261126`.
- Test commit: `4de0138be1215089566ac961f3fca54bec20acdb`.
- Test: `test/agent2-weakmap-prototype-carrier-alias-audit.test.js`.
- Focused run: [45859902121](https://github.com/FlareZ123/obfs/actions/runs/45859902121).

The run logs show all four container/factory cases fail on Ubuntu, Windows and macOS, while the five getter-extraction regressions pass on all three. The failures report `observesFunctionSource=false`, five to seven identifier binding rewrites, equal ordinary return values, and changed captured function source.

The helper's `isWeakMapInstance()` recognizes a direct `NewExpression` or a tracked identifier. It does not propagate WeakMap identity through local object/array container properties and later member reads. It also computes a set of local WeakMap factories but does not recognize a `CallExpression` of a known local factory as a WeakMap instance. The direct-call and inline nested-expression veto therefore remains incomplete.

This is another distinct residual false-safe in the Agent 10 donor. The group-level repair must track object/array container contents, aliases, member reads and local factory call results, or conservatively reject the relevant flows. Agent 10 and Agent 1 received the exact witnesses.

### Challenge of Agent 4's group-summary donor

The same nine-case test file was run against Agent 4's donor `agent4/weakmap-group-prototype-summary-fix-20261126` at `1c3f427409dbda7f0eacac46a1aa44b1ef4c42e6`.

- Test-only branch: `agent2/weakmap-agent4-challenge-20261126`.
- Test commit: `9f99eb3d093e3a2c02fa4b8970b958d8c3a46709`.
- Test: `test/agent2-weakmap-agent4-donor-challenge.test.js`.
- Focused run: [45860227295](https://github.com/FlareZ123/obfs/actions/runs/45860227295).

All nine cases fail on Ubuntu, Windows and macOS: the five getter-extraction forms plus the four container/factory forms. Each reports `observesFunctionSource=false`, five to seven identifier bindings rewritten, identical ordinary return values, and different captured function source.

Thus the Agent 4 donor at this exact pin does not close this negative matrix. This is distinct from Agent 10's donor, which passes the five getter cases but fails the four container/factory cases. Neither donor is safe to adopt as-is. Agent 1 and Agent 4 were notified; Agent 1 remains the integration owner.

## Required follow-up

The WeakMap-specific proof must fail closed when prototype getter extraction can reach a WeakMap instance's prototype, including the four reproduced routes and statically computed/aliased variants. A guard limited to the names `getPrototypeOf` and `__proto__` as member accesses is insufficient.

Agent 1 and Agent 4 were notified through their mailboxes. PR #382 remains draft; Agent 2 explicitly withheld authorization to move its head while this false-safe remains unresolved. The candidate needs a new exact-head independent challenge and full required validation after the guard is repaired.

The aliased descriptor, direct Reflect.get, and aliased Reflect.get variants are also confirmed false-safes on Ubuntu, Windows and macOS in runs 45854804850 and 45855558815.
