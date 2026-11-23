# Storage API function-source observation: localStorage and sessionStorage

**Status:** reproducible intermediate finding; not a release result.

## Summary

The current-main-pinned source-observer scanner does not classify `Storage.setItem` as a function-source observer. The HTML Standard declares the `Storage.setItem(DOMString key, DOMString value)` signature. A function passed as the value undergoes Web IDL `DOMString` conversion. The resulting native function source is stored and can be read back using `getItem`. This is confirmed for `localStorage` and `sessionStorage`.

A second route is the Storage named-property setter: `localStorage[key] = inspect`. It also stores the function's native source and reads back the same string.

Normative source: [WHATWG HTML Standard, Web Storage, Storage interface](https://html.spec.whatwg.org/multipage/webstorage.html#the-storage-interface).

## Source pin and reproduction

Research branch: `agent12/storage-source-observation-20261123`

Browser and focused-test head: `3f172b1d53c18a106f66ce224b9a8298c033cb68` (based on main `ca137356713babb6cff4d63feb838f9181e2f4db`).

Relevant compiler source blobs:
- `src/ast.js`: `c227e6e604635a42663af745fd0cfb194b215a67`
- `src/identifiers.js`: `c7e2ed1469381c5bc6dc42cef9a6ca8bfa347f0f`

The scanner source contains no `Storage`, `localStorage`, or `sessionStorage` sink recognition. `renameLocalIdentifiers` returns unchanged only when `observesFunctionSource(ast)` is true; the Storage call is not recognized, so local binding edits proceed.

The focused fixture is `test/storage-source-observation.test.js`. It checks:
1. the scanner returns false for the same-file Storage source observer;
2. identifier rewriting changes the local binding in the observed function;
3. a cross-file exported producer callable is currently left source-stable by the export-ancestor guard, while an unrelated unexported helper in the consumer retains identifier yield.

The real-browser fixture is `test/storage-source-observation-browser.js`. Its module contains:

- `inspect()`, whose local `privateLocal` binding is passed to `localStorage.setItem` and `sessionStorage.setItem`;
- a named-property write `localStorage[key + "-named"] = inspect`;
- `independent()`, whose `independentLocal` binding is a safe positive-yield control;
- calls to both functions whose numeric results are compared native versus emitted.

The browser page reads the stored values back through both Storage areas and the named property.

## Evidence

### Focused Node and JSDoc run

[Manual validation run 45161317608](https://github.com/FlareZ123/obfs/actions/runs/45161317608), source head `3f172b1d53c18a106f66ce224b9a8298c033cb68):

- Ubuntu Node 22.23.4: **3/3 focused tests passed**.
- Windows Node 22.23.4: **3/3 focused tests passed**.
- Project `npm run typecheck`: passed on both platforms.
- The subsequent external JSDoc gate failed on unrelated existing errors:
  - `sims/exact-quadratic-compatible-cegar.js` lines 222, 223, 266, 267: implicit-any `outputMasks` and `inputToggles`.
  - `sims/sco-triangular-quadratic-exact-cegar.js` lines 157–158: unresolved `publicMethod`.
- The workflow conclusion is therefore failure; do not describe the complete focused workflow as green.

### Real Chromium run

[Manual Web IDL run 45161326114](https://github.com/FlareZ123/obfs/actions/runs/45161326114), same source head. The new browser step ran before the existing Web IDL Node matrix and succeeded. Its exact emitted record was:

```json
{
  "browser": "Chromium",
  "metrics": {
    "literals": 0,
    "objects": 0,
    "properties": 0,
    "bindings": 2
  },
  "sourceMismatch": true,
  "nativeSource": "function inspect(){const privateLocal=29;return privateLocal;}",
  "emittedSource": "function inspect(){const _v45acf5f7243d=29;return _v45acf5f7243d;}",
  "nativeNamed": "function inspect(){const privateLocal=29;return privateLocal;}",
  "emittedNamed": "function inspect(){const _v45acf5f7243d=29;return _v45acf5f7243d;}",
  "valuesPreserved": true
}
```

Thus the emitted `inspect` function's source changed, while its numeric result remained 29. The independent helper also retained a nonzero identifier transformation and returned 7. The `localStorage.setItem`, `sessionStorage.setItem`, and Storage named-property readbacks all contained the corresponding native/emitted function source.

The overall manual Web IDL workflow subsequently failed its existing 239-test Node matrix on both OSes in two unrelated Blob positive-yield assertions:
- `bound Blob constructor with primitive input retains private property rename`;
- `primitive Blob options preserve genuinely renamed private fields`.

The Storage browser step itself passed. Do not attribute those two Blob failures to this fixture.

## Cross-file control and limits

An attempted cross-file consumer-sink extension did **not** establish a second source-parity failure. In the tested ESM shape, the producer's exported callable remained source-stable under the current export-ancestor guard, while an unrelated unexported helper in the consumer retained identifier yield. This is a useful boundary control, not proof that every cross-file Storage source-observer path is modeled.

The confirmed failure is an implicit Web IDL string-coercion source observer in the same file, not an explicit call to `Function.prototype.toString`. It currently bypasses the AST source-observer guard and changes a function's source through identifier mangling. The witness exercises COO ESM in one real Chromium environment; it does not establish Firefox/WebKit behavior, cross-tab `storage` event behavior, actual HTTP SCO partition behavior, or a universal browser compatibility claim.

The immediate correctness requirement is to classify nonprimitive values passed to `Storage.setItem` and the named-property setter as source-observing. The source-observed callable must retain exact source spelling. A future fix should also preserve useful yield in the unrelated `independent()` helper; a whole-file veto would repair parity but would lose that positive control. Property metrics were zero in this experiment: the demonstrated failure is identifier mangling.

This finding belongs in `im-results/` until the sink model, selective positive control, broader browser coverage, and cross-platform acceptance are integrated and independently reviewed. It is not evidence of confidentiality, anti-instrumentation, tamper resistance, or 2.5× performance compliance.
