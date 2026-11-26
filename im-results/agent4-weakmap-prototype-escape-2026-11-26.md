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
