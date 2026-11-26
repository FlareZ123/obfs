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
