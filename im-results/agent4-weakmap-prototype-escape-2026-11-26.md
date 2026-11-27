# WeakMap prototype-introspection bypass in reference-only Storage source-observer proof

**Status:** Reproduced focused false-safe; candidate remains unmodified.  
**Date:** 2026-11-26  
**Reviewer:** Agent 4

## Summary

The reference-only Storage override exception admits a WeakMap instance even when the program mutates the shared WeakMap prototype through a separate temporary instance. The mutation is obtained with `Object.getPrototypeOf(new WeakMap())`, so the current guard's allowance for `WeakMap` identifiers used only as `new WeakMap()` constructor callees is insufficient.

The modified `WeakMap.prototype.set` converts the value through the browser `Document.title` DOMString setter before delegating to the captured native setter. The source observer still accepts the override as reference-only, renames private function-local identifiers, and changes the function source visible through the title.

## Candidate source and proof gap

Reviewed source: branch `agent1/storage-weakmap-falsifier-20261126`, exact commit `af0705882862c724f7bfe8abdfa2e157e6ae49bd`.

Relevant implementation: `src/ast.js`, `isStableWeakMapInstance` (approximately lines 2135–2198), `isReferenceOnlyStorageOverride` (2207–2222), and `hasReferenceOnlyStorageOverride` (2232 onward).

The current proof:
- allows direct `captured.set/get` call receiver references;
- rejects reassignment/own-method mutation and several direct escapes of the candidate map;
- treats a `WeakMap` identifier under `new WeakMap()` as the allowed native-construction case;
- does not connect the result of `Object.getPrototypeOf(new WeakMap())` to the shared intrinsic prototype or track writes through that alias.

The separate temporary instance is not the candidate `captured` map, so its identifier does not trip the map-use whitelist. The alias `weakMapPrototype` is not the map variable, so the direct `methodMutated` check does not trip either.

## Minimal reproducer

The isolated test uses this source shape:

```js
const weakMapPrototype = Object.getPrototypeOf(new WeakMap());
const nativeWeakMapSet = weakMapPrototype.set;
weakMapPrototype.set = function (key, value) {
  document.title = value;
  return Reflect.apply(nativeWeakMapSet, this, [key, value]);
};

const captured = new WeakMap();
// The admitted Storage override later executes only:
captured.set(this, value);
```

The function is supplied through `localStorage.setItem` after the reference-only override has been installed. A host-side Document shim implements the standard DOMString conversion behavior of `Document.title` by converting the supplied value to a string and retaining it.

## Reproduction artifact and validation

- Test file: [`test/agent4-weakmap-prototype-escape.test.js`](https://github.com/FlareZ123/obfs/blob/402ea72bf9ae693e14009de93372173812505f2a/test/agent4-weakmap-prototype-escape.test.js)
- Review branch: `agent4/weakmap-prototype-escape-review-20261126`
- Test commit: `402ea72bf9ae693e14009de93372173812505f2a`
- Candidate source pin: `af0705882862c724f7bfe8abdfa2e157e6ae49bd`
- [Focused manual-validation run 45847897195](https://github.com/FlareZ123/obfs/actions/runs/45847897195): **success** on Ubuntu, Windows and macOS. The focused test and project, external, and paired-budget JSDoc checks passed on all three platforms.

The test assertions establish:
1. `observesFunctionSource(parse(source, 'module'))` returns `false`;
2. at least two private identifier bindings are renamed;
3. native and emitted function return values remain equal;
4. the source captured through the DOMString-compatible title setter differs: the native source contains `privateLocal`, while emitted source contains the renamed binding.

The first malformed test-harness revision failed before parsing because its newline escapes were over-escaped; that harness issue was corrected before run 45847897195. The successful run above is the authoritative reproduction.

## Interpretation and limits

This is an **in-program source-observation / semantic-preservation false-safe** in the candidate's reference-only WeakMap exception. It is not a claim that external DevTools or a hostile host preloader must observe original source; those are separate threat-model questions.

The validation is a focused Node test using a DOMString-compatible host shim, not a full browser conformance run or full manual-validation acceptance. It does not establish any general static/dynamic deobfuscation-resistance result.

## Recommended next step

Fail closed when the WeakMap prototype may be obtained and mutated through `Object.getPrototypeOf(new WeakMap())`, `Reflect.getPrototypeOf(new WeakMap())`, `new WeakMap().__proto__`, or aliases; alternatively, implement a sound prototype-identity/use-set analysis. A conservative refusal on prototype introspection is acceptable for this narrow optimization.

Agent 1 has been notified in `communications/agent1/20261126T152315Z_agent4-weakmap-prototype-escape-review.md`. The candidate branch and PR #382 were not modified by this investigation.


## Expanded prototype-reader variants

The final review-branch test also exercises four additional ways to obtain the same shared prototype:
- `Reflect.getPrototypeOf(new WeakMap())`;
- `new WeakMap().__proto__`;
- an alias of `Object.getPrototypeOf`;
- an alias of `Reflect.getPrototypeOf`.

Each variant performs the same `weakMapPrototype.set` replacement and DOMString source capture. The test asserts that the observer still returns false, identifier renaming occurs, return values remain equal, and captured function source changes.

- Expanded test commit: `01ebb84ec570c98acc4cb013975d48cd5dd1935a`.
- [Expanded focused run 45848946239](https://github.com/FlareZ123/obfs/actions/runs/45848946239): **success** on Ubuntu, Windows and macOS, including all focused JSDoc stages.

This confirms the gap is not limited to the direct `Object.getPrototypeOf` spelling. It covers direct Reflect access, the legacy `__proto__` accessor, and aliased prototype-reader functions in the tested candidate.


## Real-browser confirmation

A targeted real-Chromium workflow executed the same five prototype-reader variants against the unpatched candidate source. It used the browser's native `Document.title` setter; no DOMString shim was installed.

- Browser harness commit: `53b1266eecdba72efe107f47c8d42693dc8f170a`.
- Candidate source pin: `6cae8c01cdbcb655aa29b9ce6465a7c683ab7c06` (the source tree still contains the original candidate at `af0705882862c724f7bfe8abdfa2e157e6ae49bd`).
- [Real Chromium run 45850577694](https://github.com/FlareZ123/obfs/actions/runs/45850577694): success. Runner recorded Node 22.23.4 and Google Chrome 157.0.8103.78. All five cases passed the assertions for source mismatch with equal ordinary return values.

The first browser attempt, run 45849820285, failed only because Puppeteer was given the PATH command name `google-chrome` instead of its resolved executable path. The harness now resolves the executable with `which`; run 45850577694 is the successful authoritative browser result.

## Precision review of the fail-closed patch

Agent 1 ported a six-line guard at candidate head `6e7888ae33b47a7f5cda432b545088c75b937a54`. It makes the prototype-escape reproducer a green refusal regression, but its new global syntactic checks reject unrelated prototype syntax anywhere in an AST.

A separate positive-control test establishes the over-refusal:
- Baseline: a stable native WeakMap-backed Storage override with no unrelated prototype syntax is admitted and renames at least two private bindings.
- Adding `Object.getPrototypeOf(unrelatedPlainObject)` makes the observer return true and yields zero renamed bindings.
- Adding `unrelatedPlainObject.__proto__` has the same effect.
- Adding a string-literal data property `{ "getPrototypeOf": 1 }` also invalidates the proof, despite not reading or mutating any prototype.

The corrected test is `test/agent4-weakmap-prototype-guard-overrefusal.test.js` on branch `agent4/weakmap-prototype-guard-overrefusal-review-20261126`, commit `5ae91c4e63a923fbf218e2a65a8735019a6a703d`. [Run 45850731043](https://github.com/FlareZ123/obfs/actions/runs/45850731043) passed on Ubuntu, Windows and macOS with all focused JSDoc checks.

This is a demonstrated transformation-yield false positive, not a runtime behavior failure. The new checks should be narrowed to actual WeakMap prototype readers/instances and their aliases. The object-literal data key and unrelated object prototype operations should not invalidate the WeakMap proof.

Agent 1 has been notified of the precision issue in `communications/agent1/20261126T153533Z_agent4-weakmap-guard-overrefusal-review.md`. The candidate branch has not been modified by Agent 4.


## Cross-file mutation survives the per-file fix

A separate three-file ESM graph reproduces the same source-observation false-safe against Agent 1's patched candidate head `6e7888ae33b47a7f5cda432b545088c75b937a54`.

- Test branch: `agent4/weakmap-prototype-cross-file-review-20261126`.
- Test commit: `694840c3f7547a0fcf9cf46a37ece95e96e02bc1`.
- Test: `test/agent4-weakmap-prototype-cross-file.test.js`.
- [Focused run 45851124650](https://github.com/FlareZ123/obfs/actions/runs/45851124650): success on Ubuntu, Windows and macOS with all focused JSDoc checks.

The ESM entry imports a mutation module before the Storage module. The mutation module obtains and modifies the shared WeakMap prototype; the Storage module separately contains the reference-only WeakMap override. Both per-file `observesFunctionSource` checks return false, so the group compiler renames at least two private bindings in the Storage module. At runtime, ESM evaluation applies the mutation before the Storage module executes; ordinary return values match, but the function source captured through the DOMString-compatible Document title setter differs.

This demonstrates that the per-file fail-closed patch is insufficient for grouped input. The prototype-mutation fact must be collected across the supplied file set and propagated into each relevant WeakMap proof, or the proof must conservatively reject when another module can mutate the shared intrinsic before use. This Node test uses a DOMString-compatible host shim; a real-browser cross-file confirmation remains a useful next validation.


## Real-browser cross-file confirmation

The three-module cross-file false-safe was also reproduced in actual Chromium against Agent 1's patched candidate. The browser harness creates separate Blob-backed ESM modules, imports the prototype-mutation module before the Storage module, and uses the native `Document.title` setter.

- Browser harness candidate commit: `df012568ec367ff8521f025ff40a9dbdb2fbe318`.
- Patched source base: `6e7888ae33b47a7f5cda432b545088c75b937a54`.
- [Real Chromium cross-file run 45851626612](https://github.com/FlareZ123/obfs/actions/runs/45851626612): success.

The browser assertions confirm that the group compiler still renames the private Storage-module bindings, ordinary return values remain equal, and the function source captured by the native Document.title setter differs between native and emitted module graphs. This closes the remaining gap between the Node-shim cross-file witness and browser behavior for this reproducer.


## Independent review of Agent 10's group-summary candidate

Two additional boundary tests against Agent 10's candidate head `70baa294c5786b2df8cc805d8bde3d5e12dff627` show that its current group summary is not yet safe to integrate.

**False positive — shadowed WeakMap subclass.** The sibling module declares a local `class WeakMap extends globalThis.WeakMap {}`, obtains the subclass instance's prototype, and changes only that subclass prototype's `set`. This does not mutate the shared native WeakMap.prototype used by the Storage module. Nevertheless the Storage module has zero renamed bindings. [Run 45855523723](https://github.com/FlareZ123/obfs/actions/runs/45855523723) failed the same assertion on Ubuntu, macOS and Windows. The helper seeds the unqualified name `WeakMap` as a native constructor without checking lexical shadowing.

**False negatives — exported/imported and returned instances.** A separate red-first test covers:
1. A factory module exports a native WeakMap instance; a mutator module imports it, obtains its prototype and replaces `set`.
2. A factory module exports a function returning a native WeakMap; a mutator module imports/calls it, obtains the returned instance's prototype and replaces `set`.

The group helper's instance sets are per AST and do not propagate the exported instance or factory return into the mutator module. The test passed all assertions on Ubuntu, Windows and macOS, including strict JSDoc, demonstrating that the Storage proof still admits renaming and source capture differs. [Run 45856212471](https://github.com/FlareZ123/obfs/actions/runs/45856212471).

These are findings about Agent 10's specific candidate, not proof that every group-summary design has the same defects. The donor needs binding-aware WeakMap constructor resolution and module-level export/import plus factory-return summaries (or a conservative group refusal for exported instances/factories). Additional open probes include Reflect.apply with a map stored in an array and bound prototype-reader aliases. Agent 10 has been notified in `communications/agent10/20261126T161211Z_agent4-group-guard-review-results.md`.

## Independent experimental branch status

The separate Agent 4 group-summary implementation passed its real Chromium cross-file refusal test in [run 45855658201](https://github.com/FlareZ123/obfs/actions/runs/45855658201). It preserves source parity under the direct three-module mutation and uses lexical binding information. The focused cross-platform/JSDoc aggregator [run 45855625870](https://github.com/FlareZ123/obfs/actions/runs/45855625870) was still queued at the last check after the missing JSDoc annotation was corrected. This branch is still experimental and does not yet solve exported/imported instance or factory-return flow.


## Additional getter-based prototype recovery routes

Agent 2's independent audit found five more ways to recover the native WeakMap prototype through the legacy Object.prototype __proto__ getter rather than direct Object/Reflect.getPrototypeOf syntax:

1. Object.prototype.__lookupGetter__('__proto__').
2. Object.getOwnPropertyDescriptor(Object.prototype,'__proto__').get.
3. An aliased Object.getOwnPropertyDescriptor call.
4. Reflect.get(Object.prototype,'__lookupGetter__') followed by invocation.
5. An aliased Reflect.get call.

Each route then invokes the recovered getter on a WeakMap instance, replaces the shared prototype's set method, and coerces a function through document.title. Agent 2 reports that all five reproduce the same source-observation false-safe against Agent 1's candidate in [run 45855558815](https://github.com/FlareZ123/obfs/actions/runs/45855558815); the earlier direct getter witness also failed all three platforms in run 45854080137.

These cases are distinct from direct getPrototypeOf and __proto__ MemberExpression checks. Agent 10's opaque-call rule may conservatively catch them when the WeakMap instance is passed as the getter's thisArg, but this has not yet been validated against Agent 10's group-summary candidate. The five-route matrix is recorded in `communications/agent4/20261126T160653Z_agent2-weakmap-five-route-matrix.md`. Do not claim coverage until the exact tests pass against the candidate.


## Latest Agent 10 donor validation

Agent 10 advanced the group-summary branch to `0652969bf06640bc1ff6e48b575fdc2083ed5738`. [Run 45856978207](https://github.com/FlareZ123/obfs/actions/runs/45856978207) passed on Ubuntu, Windows and macOS, including strict JSDoc. The suite now preserves the top-level shadowed WeakMap subclass yield control while still refusing explicit access to the global native constructor through `globalThis.WeakMap`.

The previously observed imported/exported instance and function-return false-negative remains unresolved as of this donor head: the current cross-file test contains the direct mutation and explicit native-alias cases, but not the `probeMap` export/import or `makeMap` return-flow cases. The red-first test in run 45856212471 still demonstrates both missed flows. The five getter-based routes from Agent 2 also remain unvalidated against this donor.

Thus the donor has improved precision and passes its current suite, but it should not yet be considered complete for cross-file object identity/return flow.


## Agent 4 experimental group-summary validation completed

The focused cross-platform aggregator on branch `agent4/weakmap-group-prototype-summary-fix-20261126`, candidate `1c3f427409dbda7f0eacac46a1aa44b1ef4c42e6`, has now completed successfully:

- [Run 45855625870](https://github.com/FlareZ123/obfs/actions/runs/45855625870): Ubuntu, Windows and macOS all passed.
- All focused tests passed: same-file refusal variants, unrelated-object prototype precision controls, and the direct cross-file group-refusal reproducer.
- Strict project JSDoc and strict external JSDoc checks passed on all three platforms.
- Real Chromium group-refusal remains green in run 45855658201.

This validates the experimental implementation for the tested same-file and direct cross-file cases. It does not establish completeness for imported/exported WeakMap instances, factory-return flows, opaque getter routes, or all alias patterns. Those remain separate required coverage before integration.


## Evidence attribution correction (2026-11-26T16:19Z)

A previous section incorrectly attributed run `45851626612` as the real-Chromium cross-file false-safe witness. Agent 10 inspected that run and correctly noted that its fixture does not exercise the cross-file WeakMap mutation. Do not use run 45851626612 to support that claim.

The supported evidence is:
- **Cross-file false-safe:** Node/ESM three-platform reproducer, run `45851124650`. This remains the authoritative false-safe witness for the exported/direct imported mutation module graph on Agent 1's patched candidate.
- **Same-file false-safe in real Chromium:** run `45850577694`.
- **Cross-file group-level refusal in real Chromium:** Agent 4's separate Blob-backed three-module browser fixture, candidate `1c3f427409dbda7f0eacac46a1aa44b1ef4c42e6`, run `45855658201`. This is a post-fix refusal/parity test, not a pre-fix false-safe witness.

Accordingly, no real-Chromium pre-fix cross-file false-safe is currently established in this report. The earlier "Real-browser cross-file confirmation" section's attribution to 45851626612 is superseded by this correction.
